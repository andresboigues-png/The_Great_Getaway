(function(){var e={HOME:`home`,EXPENSES:`expenses`,UPLOAD:`upload`,INSIGHTS:`insights`,SETTINGS:`settings`,PERSONALIZATION:`personalization`,BUDGETS:`budgets`,COLLECTIONS:`collections`,AI:`ai`,SETTLEMENT:`settlement`,FRIENDS:`friends`,PROFILE:`profile`},t={STATE_CHANGED:`state:changed`,NOTIFICATIONS_CHANGED:`notifications:changed`},n=typeof window<`u`&&window.__GG_API_BASE__?window.__GG_API_BASE__:``,r=`Afghanistan.Albania.Algeria.Andorra.Angola.Antigua and Barbuda.Argentina.Armenia.Australia.Austria.Azerbaijan.Bahamas.Bahrain.Bangladesh.Barbados.Belarus.Belgium.Belize.Benin.Bhutan.Bolivia.Bosnia and Herzegovina.Botswana.Brazil.Brunei.Bulgaria.Burkina Faso.Burundi.Cabo Verde.Cambodia.Cameroon.Canada.Central African Republic.Chad.Chile.China.Colombia.Comoros.Congo.Costa Rica.Croatia.Cuba.Cyprus.Czech Republic.Denmark.Djibouti.Dominica.Dominican Republic.Ecuador.Egypt.El Salvador.Equatorial Guinea.Eritrea.Estonia.Eswatini.Ethiopia.Fiji.Finland.France.Gabon.Gambia.Georgia.Germany.Ghana.Greece.Grenada.Guatemala.Guinea.Guinea-Bissau.Guyana.Haiti.Honduras.Hungary.Iceland.India.Indonesia.Iran.Iraq.Ireland.Israel.Italy.Jamaica.Japan.Jordan.Kazakhstan.Kenya.Kiribati.Korea, North.Korea, South.Kosovo.Kuwait.Kyrgyzstan.Laos.Latvia.Lebanon.Lesotho.Liberia.Libya.Liechtenstein.Lithuania.Luxembourg.Madagascar.Malawi.Malaysia.Maldives.Mali.Malta.Marshall Islands.Mauritania.Mauritius.Mexico.Micronesia.Moldova.Monaco.Mongolia.Montenegro.Morocco.Mozambique.Myanmar.Namibia.Nauru.Nepal.Netherlands.New Zealand.Nicaragua.Niger.Nigeria.North Macedonia.Norway.Oman.Pakistan.Palau.Palestine.Panama.Papua New Guinea.Paraguay.Peru.Philippines.Poland.Portugal.Qatar.Romania.Russia.Rwanda.Saint Kitts and Nevis.Saint Lucia.Saint Vincent.Samoa.San Marino.Sao Tome and Principe.Saudi Arabia.Senegal.Serbia.Seychelles.Sierra Leone.Singapore.Slovakia.Slovenia.Solomon Islands.Somalia.South Africa.South Sudan.Spain.Sri Lanka.Sudan.Suriname.Sweden.Switzerland.Syria.Taiwan.Tajikistan.Tanzania.Thailand.Timor-Leste.Togo.Tonga.Trinidad and Tobago.Tunisia.Turkey.Turkmenistan.Tuvalu.Uganda.Ukraine.UAE.UK.United States (USA).Uruguay.Uzbekistan.Vanuatu.Vatican City.Venezuela.Vietnam.Yemen.Zambia.Zimbabwe`.split(`.`).sort(),i=[{i:`https://images.unsplash.com/photo-1526772662000-3f88f10405ff`,q:`To lose yourself in a new country is to find yourself in the world.`},{i:`https://images.unsplash.com/photo-1464822759023-fed622ff2c3b`,q:`Traveling is finding a place where every path leads somewhere beautiful.`},{i:`https://images.unsplash.com/photo-1501854140801-50d01698950b`,q:`To travel is to find peace in the untamed beauty of the world.`},{i:`https://images.unsplash.com/photo-1469474968028-56623f02e42e`,q:`Every sunrise is a new begginning.`},{i:`https://images.unsplash.com/photo-1447752875215-b2761acb3c5d`,q:`Allow yourself to wander roads that feel ancient and alive.`},{i:`https://images.unsplash.com/photo-1433086966358-54859d0ed716`,q:`Traveling is the bridge that connects mind and soul`},{i:`https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07`,q:`Discover hidden places in every corner.`},{i:`https://images.unsplash.com/photo-1507525428034-b723cf961d3e`,q:`Go where the horizon meets the ocean and time stands still.`},{i:`https://images.unsplash.com/photo-1473448912268-2022ce9509d8`,q:`Adventure is not a destination, it's a belief system.`},{i:`https://images.unsplash.com/photo-1493246507139-91e8fad9978e`,q:`Embrace the spirit of the backpacker`},{i:`https://images.unsplash.com/photo-1506744038136-46273834b3fb`,q:`The essence of traveling beats in every human heart.`},{i:`https://images.unsplash.com/photo-1454496522488-7a8e488e8606`,q:`Explore the peak of your potential.`}].map(e=>({i:e.i+`?auto=format&fit=crop&w=1600&q=80`,q:e.q})),a={q:`The world is a book, and those who do not travel read only one page.`,i:`1469854523086-cc02fe5d8800`,f:`Traveling is the best way to learn about the world.`},o={EUR:1,USD:.92,GBP:1.17,JPY:.0062,CHF:1.04,CAD:.68,AUD:.61,CNY:.13,BRL:.18,MXN:.055,INR:.011,IDR:58e-6,SGD:.69,NZD:.56,HKD:.12,KRW:69e-5,ZAR:.049},s={EUR:`€`,USD:`$`,GBP:`£`,JPY:`¥`,CHF:`CHF`,CAD:`C$`,AUD:`A$`,CNY:`¥`,BRL:`R$`,MXN:`MX$`,INR:`₹`,IDR:`Rp`,SGD:`S$`,NZD:`NZ$`,HKD:`HK$`,KRW:`₩`,ZAR:`R`},c={US:`USD`,GB:`GBP`,AU:`AUD`,CA:`CAD`,NZ:`NZD`,JP:`JPY`,CH:`CHF`,BR:`BRL`,MX:`MXN`,IN:`INR`,ID:`IDR`,SG:`SGD`,HK:`HKD`,KR:`KRW`,ZA:`ZAR`,CN:`CNY`},l={Afghanistan:{i:`1589192144353-8e7c107077a1`,q:`Central Asia's crossroads.`,f:`Did you know that Afghanistan has a population of about 37 million people? Its capital city is Kabul.`},Alabama:{i:`1469474968028-56623f02e42e`,q:`Sweet Home Alabama.`,f:`Did you know that the Alabama State has a population of about 5 million people? Its biggest city is Huntsville.`},Alaska:{i:`1472214103451-9374bd1c798e`,q:`The Last Frontier.`,f:`Did you know that the Alaska State has a population of about 733 thousand people? Its biggest city is Anchorage.`},Albania:{i:`1588965000000-019521f3f39b`,q:`Balkan beauty.`,f:`Did you know that Albania has a population of about 2.9 million people? Its capital city is Tirana.`},Algeria:{i:`1544062562417-380d5d113f8c`,q:`Sahara's gateway.`,f:`Did you know that Algeria has a population of about 42 million people? Its capital city is Alger.`},Andorra:{i:`1469854523086-cc02fe5d8800`,q:`Andorra is waiting for you.`,f:`Did you know that Andorra has a population of about 77 thousand people? Its capital city is Andorra la Vella.`},Angola:{i:`1469854523086-cc02fe5d8800`,q:`Angola is waiting for you.`,f:`Did you know that Angola has a population of about 31 million people? Its capital city is Luanda.`},Antigua:{i:`1469854523086-cc02fe5d8800`,q:`Antigua is waiting for you.`,f:`Did you know that Antigua and Barbuda has a population of about 96 thousand people? Its capital city is Saint John's.`},Argentina:{i:`1449433114371-d67b866d368e`,q:`Land of Tango.`,f:`Did you know that Argentina has a population of about 44 million people? Its capital city is Buenos Aires.`},Arizona:{i:`1501854140801-50d01698950b`,q:`The Grand Canyon State.`,f:`Did you know that the Arizona State has a population of about 7 million people? Its biggest city is Phoenix.`},Arkansas:{i:`1470071131384-001b85755536`,q:`The Natural State.`,f:`Did you know that the Arkansas State has a population of about 3 million people? Its biggest city is Little Rock.`},Armenia:{i:`1469854523086-cc02fe5d8800`,q:`Armenia is waiting for you.`,f:`Did you know that Armenia has a population of about 3.0 million people? Its capital city is Yerevan.`},Australia:{i:`1523413680321-4d9d448b18f9`,q:`The Great Down Under.`,f:`Did you know that Australia has a population of about 25 million people? Its capital city is Canberra.`},Austria:{i:`1516903529241-10503553f08a`,q:`Alps and Art.`,f:`Did you know that Austria has a population of about 8.8 million people? Its capital city is Wien.`},Azerbaijan:{i:`1469854523086-cc02fe5d8800`,q:`Azerbaijan is waiting for you.`,f:`Did you know that Azerbaijan has a population of about 9.9 million people? Its capital city is Baku.`},Bahamas:{i:`1469854523086-cc02fe5d8800`,q:`Bahamas is waiting for you.`,f:`Did you know that Bahamas has a population of about 386 thousand people? Its capital city is Nassau.`},Bahrain:{i:`1469854523086-cc02fe5d8800`,q:`Bahrain is waiting for you.`,f:`Did you know that Bahrain has a population of about 1.6 million people? Its capital city is al-Manama.`},Bangladesh:{i:`1469854523086-cc02fe5d8800`,q:`Bangladesh is waiting for you.`,f:`Did you know that Bangladesh has a population of about 161 million people? Its capital city is Dhaka.`},Barbados:{i:`1469854523086-cc02fe5d8800`,q:`Barbados is waiting for you.`,f:`Did you know that Barbados has a population of about 287 thousand people? Its capital city is Bridgetown.`},Belarus:{i:`1469854523086-cc02fe5d8800`,q:`Belarus is waiting for you.`,f:`Did you know that Belarus has a population of about 9.5 million people? Its capital city is Minsk.`},Belgium:{i:`1490642220353-d023b6b27e8a`,q:`Heart of Europe.`,f:`Did you know that Belgium has a population of about 11 million people? Its capital city is Bruxelles.`},Belize:{i:`1469854523086-cc02fe5d8800`,q:`Belize is waiting for you.`,f:`Did you know that Belgium has a population of about 383 thousand people? Its capital city is Belmopan.`},Benin:{i:`1469854523086-cc02fe5d8800`,q:`Benin is waiting for you.`,f:`Did you know that Benin has a population of about 11 million people? Its capital city is Porto-Novo.`},Bhutan:{i:`1469854523086-cc02fe5d8800`,q:`Bhutan is waiting for you.`,f:`Did you know that Bhutan has a population of about 754 thousand people? Its capital city is Thimphu.`},Bolivia:{i:`1469854523086-cc02fe5d8800`,q:`Bolivia is waiting for you.`,f:`Did you know that Bolivia has a population of about 11 million people? Its capital city is La Paz.`},Bosnia:{i:`1469854523086-cc02fe5d8800`,q:`Bosnia is waiting for you.`,f:`Did you know that Bosnia and Herzegovina has a population of about 3.3 million people? Its capital city is Sarajevo.`},Botswana:{i:`1469854523086-cc02fe5d8800`,q:`Botswana is waiting for you.`,f:`Did you know that Botswana has a population of about 2.3 million people? Its capital city is Gaborone.`},Brazil:{i:`1483729553833-9411f2115507`,q:`Tropical rhythms.`,f:`Did you know that Brazil has a population of about 209 million people? Its capital city is Brasília.`},Brunei:{i:`1469854523086-cc02fe5d8800`,q:`Brunei is waiting for you.`,f:`Did you know that Brunei has a population of about 429 thousand people? Its capital city is Bandar Seri Begawan.`},Bulgaria:{i:`1469854523086-cc02fe5d8800`,q:`Bulgaria is waiting for you.`,f:`Did you know that Bulgaria has a population of about 7.0 million people? Its capital city is Sofia.`},Burkina:{i:`1469854523086-cc02fe5d8800`,q:`Burkina is waiting for you.`,f:`Did you know that Burkina Faso has a population of about 20 million people? Its capital city is Ouagadougou.`},Burundi:{i:`1469854523086-cc02fe5d8800`,q:`Burundi is waiting for you.`,f:`Did you know that Burundi has a population of about 11 million people? Its capital city is Bujumbura.`},Cabo:{i:`1469854523086-cc02fe5d8800`,q:`Cabo is waiting for you.`,f:`Did you know that Cabo Verde has a population of about 556 thousand people?`},California:{i:`1465146344425-f00d5f5c8f07`,q:`The Golden State.`,f:`Did you know that the California State has a population of about 40 million people? Its biggest city is Los Angeles.`},Cambodia:{i:`1469854523086-cc02fe5d8800`,q:`Cambodia is waiting for you.`,f:`Did you know that Cambodia has a population of about 16 million people? Its capital city is Phnom Penh.`},Cameroon:{i:`1469854523086-cc02fe5d8800`,q:`Cameroon is waiting for you.`,f:`Did you know that Cameroon has a population of about 25 million people? Its capital city is Yaounde.`},Canada:{i:`1503622765438-dec7e6190771`,q:`Great White North.`,f:`Did you know that Canada has a population of about 37 million people? Its capital city is Ottawa.`},Central:{i:`1469854523086-cc02fe5d8800`,q:`Central is waiting for you.`,f:`Did you know that Central African Republic has a population of about 4.7 million people? Its capital city is Bangui.`},Chad:{i:`1469854523086-cc02fe5d8800`,q:`Chad is waiting for you.`,f:`Did you know that Chad has a population of about 15 million people? Its capital city is N'Djamena.`},Chile:{i:`1469854523086-cc02fe5d8800`,q:`Chile is waiting for you.`,f:`Did you know that Chile has a population of about 19 million people? Its capital city is Santiago de Chile.`},China:{i:`1508433313474-758b4ff2cbb0`,q:`Ancient and modern.`,f:`Did you know that China has a population of about 1.4 billion people? Its capital city is Peking.`},Colombia:{i:`1533696812891-7d124a7300c2`,q:`Coffee and color.`,f:`Did you know that Colombia has a population of about 50 million people? Its capital city is Bogota.`},Comoros:{i:`1469854523086-cc02fe5d8800`,q:`Comoros is waiting for you.`,f:`Did you know that Comoros has a population of about 832 thousand people? Its capital city is Moroni.`},Congo:{i:`1469854523086-cc02fe5d8800`,q:`Congo is waiting for you.`,f:`Did you know that Congo has a population of about 84 million people? Its capital city is Brazzaville.`},"Costa Rica":{i:`1516244433333-333333333333`,q:`Pura Vida.`,f:`Did you know that Costa Rica has a population of about 5 million people? Its capital city is San Jose.`},Croatia:{i:`1506973035811-1354d12ee703`,q:`Adriatic gem.`,f:`Did you know that Croatia has a population of about 4.1 million people? Its capital city is Zagreb.`},Cuba:{i:`1469854523086-cc02fe5d8800`,q:`Cuba is waiting for you.`,f:`Did you know that Cuba has a population of about 11 million people? Its capital city is La Habana.`},Cyprus:{i:`1469854523086-cc02fe5d8800`,q:`Cyprus is waiting for you.`,f:`Did you know that Cyprus has a population of about 1.2 million people? Its capital city is Lefkosia.`},Czech:{i:`1469854523086-cc02fe5d8800`,q:`Czech is waiting for you.`,f:`Did you know that Czech Republic has a population of about 11 million people? Its capital city is Praha.`},Denmark:{i:`1513326738677-22749004144e`,q:`Hygge home.`,f:`Did you know that Denmark has a population of about 5.8 million people? Its capital city is København.`},Djibouti:{i:`1469854523086-cc02fe5d8800`,q:`Djibouti is waiting for you.`,f:`Did you know that Djibouti has a population of about 958 thousand people? Its capital city is Djibouti.`},Dominica:{i:`1469854523086-cc02fe5d8800`,q:`Dominica is waiting for you.`,f:`Did you know that Dominica has a population of about 71 thousand people? Its capital city is Roseau.`},Dominican:{i:`1469854523086-cc02fe5d8800`,q:`Dominican is waiting for you.`,f:`Did you know that Dominican Republic has a population of about 11 million people? Its capital city is Santo Domingo.`},Ecuador:{i:`1469854523086-cc02fe5d8800`,q:`Ecuador is waiting for you.`,f:`Did you know that Ecuador has a population of about 17 million people? Its capital city is Quito.`},Egypt:{i:`1506197394155-930c76311653`,q:`Gifts of the Nile.`,f:`Did you know that Egypt has a population of about 98 million people? Its capital city is al-Qahira.`},El:{i:`1469854523086-cc02fe5d8800`,q:`El is waiting for you.`,f:`Did you know that El Salvador has a population of about 6.4 million people? Its capital city is San Salvador.`},Equatorial:{i:`1469854523086-cc02fe5d8800`,q:`Equatorial is waiting for you.`,f:`Did you know that Equatorial Guinea has a population of about 1.3 million people? Its capital city is Malabo.`},Eritrea:{i:`1469854523086-cc02fe5d8800`,q:`Eritrea is waiting for you.`,f:`Did you know that Eritrea has a population of about 3.2 million people? Its capital city is Asmara.`},Estonia:{i:`1469854523086-cc02fe5d8800`,q:`Estonia is waiting for you.`,f:`Did you know that Estonia has a population of about 1.3 million people? Its capital city is Tallinn.`},Eswatini:{i:`1469854523086-cc02fe5d8800`,q:`Eswatini is waiting for you.`,f:`Did you know that Eswatini has a population of about 1.1 million people? Its capital city is Mbabane.`},Ethiopia:{i:`1469854523086-cc02fe5d8800`,q:`Ethiopia is waiting for you.`,f:`Did you know that Ethiopia has a population of about 109 million people? Its capital city is Addis Abeba.`},Fiji:{i:`1469854523086-cc02fe5d8800`,q:`Fiji is waiting for you.`,f:`Did you know that Fiji has a population of about 883 thousand people? Its capital city is Suva.`},Finland:{i:`1518129448333-3c220f592612`,q:`Land of a thousand lakes.`,f:`Did you know that Finland has a population of about 5.5 million people? Its capital city is Helsinki.`},Florida:{i:`1447752875215-b2761acb3c5d`,q:`The Sunshine State.`,f:`Did you know that the Florida State has a population of about 21 million people? Its biggest city is Jacksonville.`},France:{i:`1502603300225-44b2019e9930`,q:`Art and elegance.`,f:`Did you know that France has a population of about 67 million people? Its capital city is Paris.`},Gabon:{i:`1469854523086-cc02fe5d8800`,q:`Gabon is waiting for you.`,f:`Did you know that Gabon has a population of about 2.1 million people? Its capital city is Libreville.`},Gambia:{i:`1469854523086-cc02fe5d8800`,q:`Gambia is waiting for you.`,f:`Did you know that Gambia has a population of about 2.1 million people? Its capital city is Banjul.`},Georgia:{i:`1501854140801-50d01698950b`,q:`Caucasus charm.`,f:`Did you know that Georgia has a population of about 3.7 million people? Its capital city is Tiflis.`},Germany:{i:`1467269013931-1d7411a33a01`,q:`History and efficiency.`,f:`Did you know that Germany has a population of about 83 million people? Its capital city is Berlin.`},Ghana:{i:`1469854523086-cc02fe5d8800`,q:`Ghana is waiting for you.`,f:`Did you know that Ghana has a population of about 30 million people? Its capital city is Accra.`},Greece:{i:`1505164222044-1803503a7d48`,q:`Cradle of civilization.`,f:`Did you know that Greece has a population of about 10 million people? Its capital city is Athenai.`},Grenada:{i:`1469854523086-cc02fe5d8800`,q:`Grenada is waiting for you.`,f:`Did you know that Grenada has a population of about 111 thousand people? Its capital city is Saint George's.`},Guatemala:{i:`1469854523086-cc02fe5d8800`,q:`Guatemala is waiting for you.`,f:`Did you know that Guatemala has a population of about 17 million people? Its capital city is Ciudad de Guatemala.`},Guinea:{i:`1469854523086-cc02fe5d8800`,q:`Guinea is waiting for you.`,f:`Did you know that Guinea has a population of about 12 million people? Its capital city is Conakry.`},"Guinea-Bissau":{i:`1469854523086-cc02fe5d8800`,q:`Guinea-Bissau is waiting for you.`,f:`Did you know that Guinea-Bissau has a population of about 1.9 million people? Its capital city is Bissau.`},Guyana:{i:`1469854523086-cc02fe5d8800`,q:`Guyana is waiting for you.`,f:`Did you know that Guyana has a population of about 779 thousand people? Its capital city is Georgetown.`},Haiti:{i:`1469854523086-cc02fe5d8800`,q:`Haiti is waiting for you.`,f:`Did you know that Haiti has a population of about 11 million people? Its capital city is Port-au-Prince.`},Hawaii:{i:`1476610971033-5c8523b7a2d6`,q:`The Aloha State.`,f:`Did you know that the Hawaii State has a population of about 2 million people? Its biggest city is Honolulu.`},Honduras:{i:`1469854523086-cc02fe5d8800`,q:`Honduras is waiting for you.`,f:`Did you know that Honduras has a population of about 9.6 million people? Its capital city is Tegucigalpa.`},Hungary:{i:`1469854523086-cc02fe5d8800`,q:`Hungary is waiting for you.`,f:`Did you know that Hungary has a population of about 9.8 million people? Its capital city is Budapest.`},Iceland:{i:`1476610971033-5c8523b7a2d6`,q:`Fire and ice.`,f:`Did you know that Iceland has a population of about 353 thousand people? Its capital city is Reykjavík.`},Idaho:{i:`1449844908441-8829872d2607`,q:`The Gem State.`,f:`Did you know that the Idaho State has a population of about 2 million people? Its biggest city is Boise.`},Illinois:{i:`1469474968028-56623f02e42e`,q:`The Prairie State.`,f:`Did you know that the Illinois State has a population of about 13 million people? Its biggest city is Chicago.`},India:{i:`1524478228052-b137a0a74564`,q:`Incredible India.`,f:`Did you know that India has a population of about 1.4 billion people? Its capital city is New Delhi.`},Indiana:{i:`1472214103451-9374bd1c798e`,q:`The Hoosier State.`,f:`Did you know that the Indiana State has a population of about 7 million people? Its biggest city is Indianapolis.`},Indonesia:{i:`1513407027603-2fcbb73c2806`,q:`Island paradise.`,f:`Did you know that Indonesia has a population of about 268 million people? Its capital city is Jakarta.`},Iowa:{i:`1501854140801-50d01698950b`,q:`The Hawkeye State.`,f:`Did you know that the Iowa State has a population of about 3 million people? Its biggest city is Des Moines.`},Iran:{i:`1469854523086-cc02fe5d8800`,q:`Iran is waiting for you.`,f:`Did you know that Iran has a population of about 82 million people? Its capital city is Tehran.`},Iraq:{i:`1469854523086-cc02fe5d8800`,q:`Iraq is waiting for you.`,f:`Did you know that Iraq has a population of about 38 million people? Its capital city is Baghdad.`},Ireland:{i:`1504449104445-9a51e6b02a20`,q:`Emerald Isle.`,f:`Did you know that Ireland has a population of about 4.9 million people? Its capital city is Dublin.`},Israel:{i:`1469854523086-cc02fe5d8800`,q:`Israel is waiting for you.`,f:`Did you know that Israel has a population of about 8.9 million people? Its capital city is Jerusalem.`},Italy:{i:`1516483638261-1478525c7f88`,q:`La Dolce Vita.`,f:`Did you know that Italy has a population of about 60 million people? Its capital city is Roma.`},Jamaica:{i:`1469854523086-cc02fe5d8800`,q:`Jamaica is waiting for you.`,f:`Did you know that Jamaica has a population of about 2.9 million people? Its capital city is Kingston.`},Japan:{i:`1493976040374-4efc0c8d1853`,q:`Land of the Rising Sun.`,f:`Did you know that Japan has a population of about 127 million people? Its capital city is Tokyo.`},Jordan:{i:`1469854523086-cc02fe5d8800`,q:`Jordan is waiting for you.`,f:`Did you know that Jordan has a population of about 10.0 million people? Its capital city is Amman.`},Kansas:{i:`1470071131384-001b85755536`,q:`The Sunflower State.`,f:`Did you know that the Kansas State has a population of about 3 million people? Its biggest city is Wichita.`},Kazakhstan:{i:`1469854523086-cc02fe5d8800`,q:`Kazakhstan is waiting for you.`,f:`Did you know that Kazakhstan has a population of about 18 million people? Its capital city is Astana.`},Kentucky:{i:`1465146344425-f00d5f5c8f07`,q:`The Bluegrass State.`,f:`Did you know that the Kentucky State has a population of about 4 million people? Its biggest city is Louisville.`},Kenya:{i:`1469854523086-cc02fe5d8800`,q:`Kenya is waiting for you.`,f:`Did you know that Kenya has a population of about 51 million people? Its capital city is Nairobi.`},Kiribati:{i:`1469854523086-cc02fe5d8800`,q:`Kiribati is waiting for you.`,f:`Did you know that Kiribati has a population of about 116 thousand people? Its capital city is Bairiki.`},Kuwait:{i:`1469854523086-cc02fe5d8800`,q:`Kuwait is waiting for you.`,f:`Did you know that Kuwait has a population of about 4.1 million people? Its capital city is Kuwait.`},Kyrgyzstan:{i:`1469854523086-cc02fe5d8800`,q:`Kyrgyzstan is waiting for you.`,f:`Did you know that Kyrgyzstan has a population of about 6.3 million people? Its capital city is Bishkek.`},Laos:{i:`1469854523086-cc02fe5d8800`,q:`Laos is waiting for you.`,f:`Did you know that Laos has a population of about 7.1 million people? Its capital city is Vientiane.`},Latvia:{i:`1469854523086-cc02fe5d8800`,q:`Latvia is waiting for you.`,f:`Did you know that Latvia has a population of about 1.9 million people? Its capital city is Riga.`},Lebanon:{i:`1469854523086-cc02fe5d8800`,q:`Lebanon is waiting for you.`,f:`Did you know that Lebanon has a population of about 6.8 million people? Its capital city is Beirut.`},Lesotho:{i:`1469854523086-cc02fe5d8800`,q:`Lesotho is waiting for you.`,f:`Did you know that Lesotho has a population of about 2.1 million people? Its capital city is Maseru.`},Liberia:{i:`1469854523086-cc02fe5d8800`,q:`Liberia is waiting for you.`,f:`Did you know that Liberia has a population of about 4.8 million people? Its capital city is Monrovia.`},Libya:{i:`1469854523086-cc02fe5d8800`,q:`Libya is waiting for you.`,f:`Did you know that Libya has a population of about 6.7 million people? Its capital city is Tripoli.`},Liechtenstein:{i:`1469854523086-cc02fe5d8800`,q:`Liechtenstein is waiting for you.`,f:`Did you know that Liechtenstein has a population of about 38 thousand people? Its capital city is Vaduz.`},Lithuania:{i:`1469854523086-cc02fe5d8800`,q:`Lithuania is waiting for you.`,f:`Did you know that Lithuania has a population of about 2.8 million people? Its capital city is Vilnius.`},Louisiana:{i:`1433086966358-54859d0ed716`,q:`The Pelican State.`,f:`Did you know that the Louisiana State has a population of about 5 million people? Its biggest city is New Orleans.`},Luxembourg:{i:`1469854523086-cc02fe5d8800`,q:`Luxembourg is waiting for you.`,f:`Did you know that Luxembourg has a population of about 608 thousand people? Its capital city is Luxembourg [Luxemburg/L.`},Madagascar:{i:`1469854523086-cc02fe5d8800`,q:`Madagascar is waiting for you.`,f:`Did you know that Madagascar has a population of about 26 million people? Its capital city is Antananarivo.`},Maine:{i:`1473448912268-2022ce9509d8`,q:`The Pine Tree State.`,f:`Did you know that the Maine State has a population of about 1 million people? Its biggest city is Portland.`},Malawi:{i:`1469854523086-cc02fe5d8800`,q:`Malawi is waiting for you.`,f:`Did you know that Malawi has a population of about 18 million people? Its capital city is Lilongwe.`},Malaysia:{i:`1469854523086-cc02fe5d8800`,q:`Malaysia is waiting for you.`,f:`Did you know that Malaysia has a population of about 32 million people? Its capital city is Kuala Lumpur.`},Maldives:{i:`1469854523086-cc02fe5d8800`,q:`Maldives is waiting for you.`,f:`Did you know that Maldives has a population of about 516 thousand people? Its capital city is Male.`},Mali:{i:`1469854523086-cc02fe5d8800`,q:`Mali is waiting for you.`,f:`Did you know that Mali has a population of about 19 million people? Its capital city is Bamako.`},Malta:{i:`1469854523086-cc02fe5d8800`,q:`Malta is waiting for you.`,f:`Did you know that Malta has a population of about 485 thousand people? Its capital city is Valletta.`},Marshall:{i:`1469854523086-cc02fe5d8800`,q:`Marshall is waiting for you.`,f:`Did you know that Marshall Islands has a population of about 58 thousand people? Its capital city is Dalap-Uliga-Darrit.`},Maryland:{i:`1447752875215-b2761acb3c5d`,q:`The Old Line State.`,f:`Did you know that the Maryland State has a population of about 6 million people? Its biggest city is Baltimore.`},Massachusetts:{i:`1464822759023-fed622ff2c3b`,q:`The Bay State.`,f:`Did you know that the Massachusetts State has a population of about 7 million people? Its biggest city is Boston.`},Mauritania:{i:`1469854523086-cc02fe5d8800`,q:`Mauritania is waiting for you.`,f:`Did you know that Mauritania has a population of about 4.4 million people? Its capital city is Nouakchott.`},Mauritius:{i:`1469854523086-cc02fe5d8800`,q:`Mauritius is waiting for you.`,f:`Did you know that Mauritius has a population of about 1.3 million people? Its capital city is Port-Louis.`},Mexico:{i:`1512813195302-3f11d1306eb5`,q:`Viva México.`,f:`Did you know that Mexico has a population of about 126 million people? Its capital city is Ciudad de M.`},Michigan:{i:`1507525428034-b723cf961d3e`,q:`The Great Lakes State.`,f:`Did you know that the Michigan State has a population of about 10 million people? Its biggest city is Detroit.`},Micronesia:{i:`1469854523086-cc02fe5d8800`,q:`Micronesia is waiting for you.`,f:`Did you know? Micronesia is full of hidden gems waiting to be explored.`},Minnesota:{i:`1476610971033-5c8523b7a2d6`,q:`The North Star State.`,f:`Did you know that the Minnesota State has a population of about 6 million people? Its biggest city is Minneapolis.`},Mississippi:{i:`1449844908441-8829872d2607`,q:`The Magnolia State.`,f:`Did you know that the Mississippi State has a population of about 3 million people? Its biggest city is Jackson.`},Missouri:{i:`1469474968028-56623f02e42e`,q:`The Show-Me State.`,f:`Did you know that the Missouri State has a population of about 6 million people? Its biggest city is Kansas City.`},Moldova:{i:`1469854523086-cc02fe5d8800`,q:`Moldova is waiting for you.`,f:`Did you know that Moldova has a population of about 2.7 million people? Its capital city is Chisinau.`},Monaco:{i:`1469854523086-cc02fe5d8800`,q:`Monaco is waiting for you.`,f:`Did you know that Monaco has a population of about 39 thousand people? Its capital city is Monaco-Ville.`},Mongolia:{i:`1469854523086-cc02fe5d8800`,q:`Mongolia is waiting for you.`,f:`Did you know that Mongolia has a population of about 3.2 million people? Its capital city is Ulan Bator.`},Montana:{i:`1472214103451-9374bd1c798e`,q:`Big Sky Country.`,f:`Did you know that the Montana State has a population of about 1 million people? Its biggest city is Billings.`},Montenegro:{i:`1469854523086-cc02fe5d8800`,q:`Montenegro is waiting for you.`,f:`Did you know that Montenegro has a population of about 631 thousand people? Its capital city is Podgorica.`},Morocco:{i:`1469854523086-cc02fe5d8800`,q:`Morocco is waiting for you.`,f:`Did you know that Morocco has a population of about 36 million people? Its capital city is Rabat.`},Mozambique:{i:`1469854523086-cc02fe5d8800`,q:`Mozambique is waiting for you.`,f:`Did you know that Mozambique has a population of about 29 million people? Its capital city is Maputo.`},Myanmar:{i:`1469854523086-cc02fe5d8800`,q:`Myanmar is waiting for you.`,f:`Did you know that Myanmar has a population of about 54 million people? Its capital city is Rangoon (Yangon).`},Namibia:{i:`1469854523086-cc02fe5d8800`,q:`Namibia is waiting for you.`,f:`Did you know that Namibia has a population of about 2.4 million people? Its capital city is Windhoek.`},Nauru:{i:`1469854523086-cc02fe5d8800`,q:`Nauru is waiting for you.`,f:`Did you know that Nauru has a population of about 13 thousand people? Its capital city is Yaren.`},Nebraska:{i:`1501854140801-50d01698950b`,q:`The Cornhusker State.`,f:`Did you know that the Nebraska State has a population of about 2 million people? Its biggest city is Omaha.`},Nepal:{i:`1469854523086-cc02fe5d8800`,q:`Nepal is waiting for you.`,f:`Did you know that Nepal has a population of about 28 million people? Its capital city is Kathmandu.`},Netherlands:{i:`1513481615233-5e67010e407d`,q:`Canals and colors.`,f:`Did you know that Netherlands has a population of about 17 million people? Its capital city is Amsterdam.`},Nevada:{i:`1470071131384-001b85755536`,q:`The Silver State.`,f:`Did you know that the Nevada State has a population of about 3 million people? Its biggest city is Las Vegas.`},"New Hampshire":{i:`1465146344425-f00d5f5c8f07`,q:`Live Free or Die.`,f:`Did you know that the New Hampshire State has a population of about 1 million people? Its biggest city is Manchester.`},"New Jersey":{i:`1433086966358-54859d0ed716`,q:`The Garden State.`,f:`Did you know that the New Jersey State has a population of about 9 million people? Its biggest city is Newark.`},"New Mexico":{i:`1473448912268-2022ce9509d8`,q:`Land of Enchantment.`,f:`Did you know that the New Mexico State has a population of about 2 million people? Its biggest city is Albuquerque.`},"New York":{i:`1447752875215-b2761acb3c5d`,q:`The Empire State.`,f:`Did you know that the New York State has a population of about 20 million people? Its biggest city is New York City.`},"New Zealand":{i:`1469854523086-cc02fe5d8800`,q:`New Zealand is waiting for you.`,f:`Did you know that New Zealand has a population of about 4.8 million people? Its capital city is Wellington.`},Nicaragua:{i:`1469854523086-cc02fe5d8800`,q:`Nicaragua is waiting for you.`,f:`Did you know that Nicaragua has a population of about 6.5 million people? Its capital city is Managua.`},Niger:{i:`1469854523086-cc02fe5d8800`,q:`Niger is waiting for you.`,f:`Did you know that Niger has a population of about 22 million people? Its capital city is Niamey.`},Nigeria:{i:`1469854523086-cc02fe5d8800`,q:`Nigeria is waiting for you.`,f:`Did you know that Nigeria has a population of about 196 million people? Its capital city is Abuja.`},"North Carolina":{i:`1464822759023-fed622ff2c3b`,q:`First in Flight.`,f:`Did you know that the North Carolina State has a population of about 10 million people? Its biggest city is Charlotte.`},"North Dakota":{i:`1507525428034-b723cf961d3e`,q:`The Peace Garden State.`,f:`Did you know that the North Dakota State has a population of about 779 thousand people? Its biggest city is Fargo.`},"North Macedonia":{i:`1469854523086-cc02fe5d8800`,q:`North Macedonia is waiting for you.`,f:`Did you know that North Macedonia has a population of about 2.1 million people? Its capital city is Skopje.`},Norway:{i:`1519067793744-119192411b21`,q:`Fjord fantasy.`,f:`Did you know that Norway has a population of about 5.3 million people? Its capital city is Oslo.`},Ohio:{i:`1476610971033-5c8523b7a2d6`,q:`The Buckeye State.`,f:`Did you know that the Ohio State has a population of about 12 million people? Its biggest city is Columbus.`},Oklahoma:{i:`1449844908441-8829872d2607`,q:`The Sooner State.`,f:`Did you know that the Oklahoma State has a population of about 4 million people? Its biggest city is Oklahoma City.`},Oman:{i:`1469854523086-cc02fe5d8800`,q:`Oman is waiting for you.`,f:`Did you know that Oman has a population of about 4.8 million people? Its capital city is Masqat.`},Oregon:{i:`1469474968028-56623f02e42e`,q:`The Beaver State.`,f:`Did you know that the Oregon State has a population of about 4 million people? Its biggest city is Portland.`},Pakistan:{i:`1469854523086-cc02fe5d8800`,q:`Pakistan is waiting for you.`,f:`Did you know that Pakistan has a population of about 212 million people? Its capital city is Islamabad.`},Palau:{i:`1469854523086-cc02fe5d8800`,q:`Palau is waiting for you.`,f:`Did you know that Palau has a population of about 18 thousand people? Its capital city is Koror.`},Palestine:{i:`1469854523086-cc02fe5d8800`,q:`Palestine is waiting for you.`,f:`Did you know that Palestine has a population of about 4.6 million people? Its capital city is Gaza.`},Panama:{i:`1469854523086-cc02fe5d8800`,q:`Panama is waiting for you.`,f:`Did you know that Panama has a population of about 4.2 million people? Its capital city is Ciudad de Panamá.`},"Papua New Guinea":{i:`1469854523086-cc02fe5d8800`,q:`Papua New Guinea is waiting for you.`,f:`Did you know that Papua New Guinea has a population of about 8.6 million people? Its capital city is Port Moresby.`},Paraguay:{i:`1469854523086-cc02fe5d8800`,q:`Paraguay is waiting for you.`,f:`Did you know that Paraguay has a population of about 7.0 million people? Its capital city is Asunción.`},Pennsylvania:{i:`1472214103451-9374bd1c798e`,q:`The Keystone State.`,f:`Did you know that the Pennsylvania State has a population of about 13 million people? Its biggest city is Philadelphia.`},Peru:{i:`1469854523086-cc02fe5d8800`,q:`Peru is waiting for you.`,f:`Did you know that Peru has a population of about 32 million people? Its capital city is Lima.`},Philippines:{i:`1469854523086-cc02fe5d8800`,q:`Philippines is waiting for you.`,f:`Did you know that Philippines has a population of about 107 million people? Its capital city is Manila.`},Poland:{i:`1469854523086-cc02fe5d8800`,q:`Poland is waiting for you.`,f:`Did you know that Poland has a population of about 38 million people? Its capital city is Warszawa.`},Portugal:{i:`1515232353913-9092d6e32a21`,q:`Atlantic soulful.`,f:`Did you know that Portugal has a population of about 10 million people? Its capital city is Lisboa.`},Qatar:{i:`1469854523086-cc02fe5d8800`,q:`Qatar is waiting for you.`,f:`Did you know that Qatar has a population of about 2.8 million people? Its capital city is Doha.`},"Rhode Island":{i:`1501854140801-50d01698950b`,q:`The Ocean State.`,f:`Did you know that the Rhode Island State has a population of about 1 million people? Its biggest city is Providence.`},Romania:{i:`1469854523086-cc02fe5d8800`,q:`Romania is waiting for you.`,f:`Did you know that Romania has a population of about 19 million people? Its capital city is Bucuresti.`},Russia:{i:`1469854523086-cc02fe5d8800`,q:`Russia is waiting for you.`,f:`Did you know? Russia is full of hidden gems waiting to be explored.`},Rwanda:{i:`1469854523086-cc02fe5d8800`,q:`Rwanda is waiting for you.`,f:`Did you know that Rwanda has a population of about 12 million people? Its capital city is Kigali.`},"Saint Kitts And Nevis":{i:`1469854523086-cc02fe5d8800`,q:`Saint Kitts And Nevis is waiting for you.`,f:`Did you know that Saint Kitts and Nevis has a population of about 52 thousand people? Its capital city is Basseterre.`},"Saint Lucia":{i:`1469854523086-cc02fe5d8800`,q:`Saint Lucia is waiting for you.`,f:`Did you know that Saint Lucia has a population of about 182 thousand people? Its capital city is Castries.`},"Saint Vincent":{i:`1469854523086-cc02fe5d8800`,q:`Saint Vincent is waiting for you.`,f:`Did you know? Saint Vincent is full of hidden gems waiting to be explored.`},Samoa:{i:`1469854523086-cc02fe5d8800`,q:`Samoa is waiting for you.`,f:`Did you know that Samoa has a population of about 196 thousand people? Its capital city is Apia.`},"San Marino":{i:`1469854523086-cc02fe5d8800`,q:`San Marino is waiting for you.`,f:`Did you know that San Marino has a population of about 34 thousand people? Its capital city is San Marino.`},"Sao Tome And Principe":{i:`1469854523086-cc02fe5d8800`,q:`Sao Tome And Principe is waiting for you.`,f:`Did you know that Sao Tome and Principe has a population of about 211 thousand people? Its capital city is São Tomé.`},"Saudi Arabia":{i:`1469854523086-cc02fe5d8800`,q:`Saudi Arabia is waiting for you.`,f:`Did you know that Saudi Arabia has a population of about 34 million people? Its capital city is Riyadh.`},Senegal:{i:`1469854523086-cc02fe5d8800`,q:`Senegal is waiting for you.`,f:`Did you know that Senegal has a population of about 16 million people? Its capital city is Dakar.`},Serbia:{i:`1469854523086-cc02fe5d8800`,q:`Serbia is waiting for you.`,f:`Did you know that Serbia has a population of about 7.0 million people? Its capital city is Belgrade.`},Seychelles:{i:`1469854523086-cc02fe5d8800`,q:`Seychelles is waiting for you.`,f:`Did you know that Seychelles has a population of about 97 thousand people? Its capital city is Victoria.`},"Sierra Leone":{i:`1469854523086-cc02fe5d8800`,q:`Sierra Leone is waiting for you.`,f:`Did you know that Sierra Leone has a population of about 7.7 million people? Its capital city is Freetown.`},Singapore:{i:`1469854523086-cc02fe5d8800`,q:`Singapore is waiting for you.`,f:`Did you know that Singapore has a population of about 5.6 million people? Its capital city is Singapore.`},Slovakia:{i:`1469854523086-cc02fe5d8800`,q:`Slovakia is waiting for you.`,f:`Did you know that Slovakia has a population of about 5.4 million people? Its capital city is Bratislava.`},Slovenia:{i:`1469854523086-cc02fe5d8800`,q:`Slovenia is waiting for you.`,f:`Did you know that Slovenia has a population of about 2.1 million people? Its capital city is Ljubljana.`},"Solomon Islands":{i:`1469854523086-cc02fe5d8800`,q:`Solomon Islands is waiting for you.`,f:`Did you know that Solomon Islands has a population of about 653 thousand people? Its capital city is Honiara.`},Somalia:{i:`1469854523086-cc02fe5d8800`,q:`Somalia is waiting for you.`,f:`Did you know that Somalia has a population of about 15 million people? Its capital city is Mogadishu.`},"South Africa":{i:`1469854523086-cc02fe5d8800`,q:`South Africa is waiting for you.`,f:`Did you know that South Africa has a population of about 58 million people? Its capital city is Pretoria.`},"South Carolina":{i:`1470071131384-001b85755536`,q:`The Palmetto State.`,f:`Did you know that the South Carolina State has a population of about 5 million people? Its biggest city is Charleston.`},"South Dakota":{i:`1465146344425-f00d5f5c8f07`,q:`Mount Rushmore State.`,f:`Did you know that the South Dakota State has a population of about 887 thousand people? Its biggest city is Sioux Falls.`},"South Sudan":{i:`1469854523086-cc02fe5d8800`,q:`South Sudan is waiting for you.`,f:`Did you know that South Sudan has a population of about 11 million people? Its capital city is Juba.`},Spain:{i:`1506665531191-c414908a8a4a`,q:`Passion and sun.`,f:`Did you know that Spain has a population of about 47 million people? Its capital city is Madrid.`},"Sri Lanka":{i:`1469854523086-cc02fe5d8800`,q:`Sri Lanka is waiting for you.`,f:`Did you know that Sri Lanka has a population of about 22 million people? Its capital city is Colombo, Sri Jayawardenepura Kotte.`},Sudan:{i:`1469854523086-cc02fe5d8800`,q:`Sudan is waiting for you.`,f:`Did you know that Sudan has a population of about 42 million people? Its capital city is Khartum.`},Suriname:{i:`1469854523086-cc02fe5d8800`,q:`Suriname is waiting for you.`,f:`Did you know that Suriname has a population of about 576 thousand people? Its capital city is Paramaribo.`},Sweden:{i:`1469854523086-cc02fe5d8800`,q:`Sweden is waiting for you.`,f:`Did you know that Sweden has a population of about 10 million people? Its capital city is Stockholm.`},Switzerland:{i:`1516584222044-1803503a7d48`,q:`Mountain majesty.`,f:`Did you know that Switzerland has a population of about 8.5 million people? Its capital city is Bern.`},Syria:{i:`1469854523086-cc02fe5d8800`,q:`Syria is waiting for you.`,f:`Did you know that Syria has a population of about 17 million people? Its capital city is Damascus.`},Taiwan:{i:`1469854523086-cc02fe5d8800`,q:`Taiwan is waiting for you.`,f:`Did you know? Taiwan is full of hidden gems waiting to be explored.`},Tajikistan:{i:`1469854523086-cc02fe5d8800`,q:`Tajikistan is waiting for you.`,f:`Did you know that Tajikistan has a population of about 9.1 million people? Its capital city is Dushanbe.`},Tanzania:{i:`1469854523086-cc02fe5d8800`,q:`Tanzania is waiting for you.`,f:`Did you know that Tanzania has a population of about 56 million people? Its capital city is Dodoma.`},Tennessee:{i:`1433086966358-54859d0ed716`,q:`The Volunteer State.`,f:`Did you know that the Tennessee State has a population of about 7 million people? Its biggest city is Nashville.`},Texas:{i:`1473448912268-2022ce9509d8`,q:`The Lone Star State.`,f:`Did you know that the Texas State has a population of about 29 million people? Its biggest city is Houston.`},Thailand:{i:`1528127269394-b7d91e0a2736`,q:`Land of smiles.`,f:`Did you know that Thailand has a population of about 69 million people? Its capital city is Bangkok.`},"Timor-Leste":{i:`1469854523086-cc02fe5d8800`,q:`Timor-Leste is waiting for you.`,f:`Did you know? Timor-Leste is full of hidden gems waiting to be explored.`},Togo:{i:`1469854523086-cc02fe5d8800`,q:`Togo is waiting for you.`,f:`Did you know that Togo has a population of about 7.9 million people? Its capital city is Lomé.`},Tonga:{i:`1469854523086-cc02fe5d8800`,q:`Tonga is waiting for you.`,f:`Did you know that Tonga has a population of about 103 thousand people? Its capital city is Nuku'alofa.`},"Trinidad And Tobago":{i:`1469854523086-cc02fe5d8800`,q:`Trinidad And Tobago is waiting for you.`,f:`Did you know that Trinidad and Tobago has a population of about 1.4 million people? Its capital city is Port-of-Spain.`},Tunisia:{i:`1469854523086-cc02fe5d8800`,q:`Tunisia is waiting for you.`,f:`Did you know that Tunisia has a population of about 12 million people? Its capital city is Tunis.`},Turkey:{i:`1524231754455-da7484439366`,q:`East meets West.`,f:`Did you know that Turkey has a population of about 82 million people? Its capital city is Ankara.`},Turkmenistan:{i:`1469854523086-cc02fe5d8800`,q:`Turkmenistan is waiting for you.`,f:`Did you know that Turkmenistan has a population of about 5.9 million people? Its capital city is Ashgabat.`},Tuvalu:{i:`1469854523086-cc02fe5d8800`,q:`Tuvalu is waiting for you.`,f:`Did you know that Tuvalu has a population of about 12 thousand people? Its capital city is Funafuti.`},UK:{i:`1486325212042-2e47fa4c13a0`,q:`British heritage.`,f:`Did you know that UK has a population of about 66 million people? Its capital city is London.`},Uae:{i:`1469854523086-cc02fe5d8800`,q:`Uae is waiting for you.`,f:`Did you know that UAE has a population of about 9.6 million people? Its capital city is Abu Dhabi.`},Uganda:{i:`1469854523086-cc02fe5d8800`,q:`Uganda is waiting for you.`,f:`Did you know that Uganda has a population of about 43 million people? Its capital city is Kampala.`},Uk:{i:`1469854523086-cc02fe5d8800`,q:`Uk is waiting for you.`,f:`Did you know that UK has a population of about 66 million people? Its capital city is London.`},Ukraine:{i:`1469854523086-cc02fe5d8800`,q:`Ukraine is waiting for you.`,f:`Did you know that Ukraine has a population of about 45 million people? Its capital city is Kyiv.`},"United Arab Emirates (UAE)":{i:`1512453973954-47efef380d6d`,q:`Future in the sand.`,f:`Did you know? United Arab Emirates (UAE) is full of hidden gems waiting to be explored.`},Uruguay:{i:`1469854523086-cc02fe5d8800`,q:`Uruguay is waiting for you.`,f:`Did you know that Uruguay has a population of about 3.4 million people? Its capital city is Montevideo.`},Usa:{i:`1469854523086-cc02fe5d8800`,q:`Usa is waiting for you.`,f:`Did you know that USA has a population of about 327 million people? Its capital city is Washington.`},Utah:{i:`1447752875215-b2761acb3c5d`,q:`Life Elevated.`,f:`Did you know that the Utah State has a population of about 3 million people? Its biggest city is Salt Lake City.`},Uzbekistan:{i:`1469854523086-cc02fe5d8800`,q:`Uzbekistan is waiting for you.`,f:`Did you know that Uzbekistan has a population of about 33 million people? Its capital city is Toskent.`},Vanuatu:{i:`1469854523086-cc02fe5d8800`,q:`Vanuatu is waiting for you.`,f:`Did you know that Vanuatu has a population of about 293 thousand people? Its capital city is Port-Vila.`},"Vatican City":{i:`1469854523086-cc02fe5d8800`,q:`Vatican City is waiting for you.`,f:`Did you know? Vatican City is full of hidden gems waiting to be explored.`},Venezuela:{i:`1469854523086-cc02fe5d8800`,q:`Venezuela is waiting for you.`,f:`Did you know that Venezuela has a population of about 29 million people? Its capital city is Caracas.`},Vermont:{i:`1464822759023-fed622ff2c3b`,q:`The Green Mountain State.`,f:`Did you know that the Vermont State has a population of about 643 thousand people? Its biggest city is Burlington.`},Vietnam:{i:`1528127269394-b7d91e0a2736`,q:`Timeless charm.`,f:`Did you know that Vietnam has a population of about 96 million people? Its capital city is Hanoi.`},Virginia:{i:`1507525428034-b723cf961d3e`,q:`Virginia is for Lovers.`,f:`Did you know that the Virginia State has a population of about 9 million people? Its biggest city is Virginia Beach.`},Washington:{i:`1476610971033-5c8523b7a2d6`,q:`The Evergreen State.`,f:`Did you know that the Washington State has a population of about 8 million people? Its biggest city is Seattle.`},"West Virginia":{i:`1449844908441-8829872d2607`,q:`Mountain Mama.`,f:`Did you know that the West Virginia State has a population of about 2 million people? Its biggest city is Charleston.`},Wisconsin:{i:`1469474968028-56623f02e42e`,q:`America's Dairyland.`,f:`Did you know that the Wisconsin State has a population of about 6 million people? Its biggest city is Milwaukee.`},Wyoming:{i:`1472214103451-9374bd1c798e`,q:`The Equality State.`,f:`Did you know that the Wyoming State has a population of about 577 thousand people? Its biggest city is Cheyenne.`},Yemen:{i:`1469854523086-cc02fe5d8800`,q:`Yemen is waiting for you.`,f:`Did you know that Yemen has a population of about 28 million people? Its capital city is Sanaa.`},Zambia:{i:`1469854523086-cc02fe5d8800`,q:`Zambia is waiting for you.`,f:`Did you know that Zambia has a population of about 17 million people? Its capital city is Lusaka.`},Zimbabwe:{i:`1469854523086-cc02fe5d8800`,q:`Zimbabwe is waiting for you.`,f:`Did you know that Zimbabwe has a population of about 14 million people? Its capital city is Harare.`}};`Alabama.Alaska.Arizona.Arkansas.California.Colorado.Connecticut.Delaware.Florida.Georgia.Hawaii.Idaho.Illinois.Indiana.Iowa.Kansas.Kentucky.Louisiana.Maine.Maryland.Massachusetts.Michigan.Minnesota.Mississippi.Missouri.Montana.Nebraska.Nevada.New Hampshire.New Jersey.New Mexico.New York.North Carolina.North Dakota.Ohio.Oklahoma.Oregon.Pennsylvania.Rhode Island.South Carolina.South Dakota.Tennessee.Texas.Utah.Vermont.Virginia.Washington.West Virginia.Wisconsin.Wyoming`.split(`.`).sort();var u=e=>typeof e==`object`&&!!e&&!Array.isArray(e),d=e=>Array.isArray(e);function f(e){if(!u(e))return{ok:!1,error:`expected object at top level, got ${typeof e}`};for(let t of[`trips`,`expenses`,`companions`,`categories`,`budgets`,`tripDays`])if(t in e&&!d(e[t]))return{ok:!1,error:`${t} must be an array, got ${typeof e[t]}`};if(d(e.trips)){for(let t of e.trips.slice(0,3))if(!u(t)||typeof t.id!=`string`||typeof t.name!=`string`)return{ok:!1,error:`trip rows missing id/name fields`}}return{ok:!0,value:e}}function p(e){if(!u(e))return{ok:!1,error:`expected object, got ${typeof e}`};for(let t of[`trips`,`expenses`,`categories`,`budgets`,`tripDays`,`archivedTrips`,`savedFormats`,`notifications`])if(t in e&&!d(e[t]))return{ok:!1,error:`STATE.${t} must be an array, got ${typeof e[t]}`};return`activeTripId`in e&&e.activeTripId!==null&&typeof e.activeTripId!=`string`?{ok:!1,error:`STATE.activeTripId must be string or null, got ${typeof e.activeTripId}`}:`user`in e&&e.user!==null&&!u(e.user)?{ok:!1,error:`STATE.user must be object or null, got ${typeof e.user}`}:{ok:!0,value:e}}function m(e){if(!Array.isArray(e))return[];let t=[];for(let n of e)if(typeof n==`string`)n&&t.push({name:n});else if(n&&typeof n==`object`&&typeof n.name==`string`&&n.name){let e={name:n.name};n.linkedUserId&&(e.linkedUserId=n.linkedUserId),t.push(e)}return t}function h(e){return(e?.companions??[]).map(e=>e.name)}function g(e,t){if(t)return(e?.companions??[]).find(e=>e.name===t)}function _(e,t){if(t)return(e?.companions??[]).find(e=>e.linkedUserId===t)}function v(e,t,n){e.companions||=[];let r=e.companions.find(e=>e.name===t);if(r)return n&&!r.linkedUserId&&(r.linkedUserId=n),r;let i={name:t};return n&&(i.linkedUserId=n),e.companions.push(i),i}function y(e,t){if(!e.companions)return!1;let n=e.companions.length;return e.companions=e.companions.filter(e=>e.name!==t),e.companions.length<n}var b={trips:[],activeTripId:null,categories:[{id:`c1`,name:`Food`,icon:`🍔`,color:`#ff3b30`},{id:`c2`,name:`Transport`,icon:`✈️`,color:`#007aff`},{id:`c3`,name:`Accommodation`,icon:`🏨`,color:`#5856d6`}],expenses:[],draftExpense:{who:``,categoryId:``,label:``,date:``,country:``,value:``,currency:`EUR`,euroValue:``},insightCurrency:`EUR`,rateMode:`at_trip`,rateCache:{},user:null,hasLoggedInBefore:!1,excelMapping:{who:`Who`,categoryId:`Category`,label:`Label`,date:`Date`,country:`Country`,value:`Value`,currency:`Currency`,euroValue:`Euro Value`},activities:[],photos:[],budgets:[],savedFormats:[],tripDays:[],archivedTrips:[],activeDetailId:null,notifications:[],preferences:{mapDefaultPois:[`sights`,`parks`,`transit`],poiFilters:{},pillEpicenters:{},poiAnchoring:{},poiVisible:{},enabledPois:{}}};function x(){let e=localStorage.getItem(`theGreatEscapeState`);if(e){let t;try{t=JSON.parse(e)}catch(e){console.error(`localStorage parse failed — starting with empty state:`,e),t=null}if(t){let e=p(t);e.ok?Object.assign(b,e.value):console.error(`localStorage shape invalid — starting with empty state:`,e.error)}}b.savedFormats||=[],b.tripDays||=[],b.archivedTrips||=[],b.preferences||={mapDefaultPois:[`sights`,`parks`,`transit`],poiFilters:{},pillEpicenters:{},poiAnchoring:{}},Array.isArray(b.preferences.mapDefaultPois)||(b.preferences.mapDefaultPois=[`sights`,`parks`,`transit`]),(!b.preferences.poiFilters||typeof b.preferences.poiFilters!=`object`)&&(b.preferences.poiFilters={}),(!b.preferences.pillEpicenters||typeof b.preferences.pillEpicenters!=`object`)&&(b.preferences.pillEpicenters={}),(!b.preferences.poiAnchoring||typeof b.preferences.poiAnchoring!=`object`)&&(b.preferences.poiAnchoring={}),(!b.preferences.poiVisible||typeof b.preferences.poiVisible!=`object`)&&(b.preferences.poiVisible={}),(!b.preferences.enabledPois||typeof b.preferences.enabledPois!=`object`)&&(b.preferences.enabledPois={});for(let e of b.trips||[])e.companions=m(e.companions);for(let e of b.archivedTrips||[])e.companions=m(e.companions);if(b.user?.id){let e=b.user,t=e.name?.split(` `)[0]||`Me`;for(let n of b.trips||[])n.ownerId===e.id&&(n.companions||=[],n.companions.some(t=>t.linkedUserId===e.id)||n.companions.unshift({name:t,linkedUserId:e.id}),n.members||=[],n.members.some(t=>t.userId===e.id)||n.members.unshift({userId:e.id,role:`planner`,archived:!1,name:e.name??null,picture:e.picture??null}))}b.tripDays.forEach(e=>{e.tickets||=[],e.notes===void 0&&(e.notes=``),e.plan||={morning:``,afternoon:``,evening:``}}),b.trips.length>0&&(!b.activeTripId||!b.trips.find(e=>e.id===b.activeTripId))&&(b.activeTripId=b.trips[0].id)}function S(){b.tripDays&&b.tripDays.forEach(e=>{e.tickets||=[]}),localStorage.setItem(`theGreatEscapeState`,JSON.stringify(b))}var C=new Map;function w(e,t){return C.has(e)||C.set(e,new Set),C.get(e).add(t),()=>C.get(e)?.delete(t)}function T(e,t){C.get(e)?.forEach(n=>{try{n(t)}catch(t){console.error(`Subscriber for "${e}" threw:`,t)}})}w(t.STATE_CHANGED,S);var E={glass:`card-glass-modal`,"glass-light":`card-glass-modal-light`,confirm:`card-glass-confirm`},D=`a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])`;function O(e){let{variant:t=`glass`,cardClass:n,cardStyle:r=``,innerHTML:i,closeOnBackdrop:a=!0,closeOnEscape:o=!0,onClose:s}=e,c=document.activeElement,l=n??E[t],u=document.createElement(`div`);u.className=`modal-overlay`,u.style.display=`flex`,u.style.backdropFilter=`blur(25px)`,u.innerHTML=`<div class="${l}"${r?` style="${r}"`:``}>${i}</div>`;let d=!1,f=()=>{d||(d=!0,document.removeEventListener(`keydown`,p,!0),u.remove(),c&&typeof c.focus==`function`&&c.focus(),s?.())},p=e=>{if(e.key===`Escape`&&o){e.stopPropagation(),f();return}if(e.key===`Tab`){let t=Array.from(u.querySelectorAll(D));if(t.length===0)return;let n=t[0],r=t[t.length-1],i=document.activeElement;e.shiftKey&&i===n?(e.preventDefault(),r.focus()):!e.shiftKey&&i===r&&(e.preventDefault(),n.focus())}};return a&&u.addEventListener(`click`,e=>{e.target===u&&f()}),document.addEventListener(`keydown`,p,!0),document.body.appendChild(u),queueMicrotask(()=>{let e=u.querySelector(`[autofocus]`);if(e){e.focus();return}u.querySelector(D)?.focus()}),{root:u,close:f}}function ee(){try{let e=(typeof navigator<`u`&&navigator.language||`en-US`).split(`-`)[1];if(e&&c[e.toUpperCase()])return c[e.toUpperCase()]}catch{}return`EUR`}function k(){let e=b.user&&b.user.homeCurrency;if(e&&o[e])return e;let t=ee();return o[t]?t:`EUR`}function A(e,t,n){if(t===n)return e;let r=o[t]||1,i=o[n]||1;return e*r/i}function j(e,t=`EUR`){let n=k(),r=A(e,t,n);return`${s[n]||n+` `}${r.toFixed(2)}`}function te(e){return s[e]||e+` `}var ne={"united states":`Usa`,"united states of america":`Usa`,usa:`Usa`,us:`Usa`,"united kingdom":`UK`,uk:`UK`,"great britain":`UK`,"united arab emirates":`UAE`,czechia:`Czech`,"czech republic":`Czech`,"burkina faso":`Burkina`,"cabo verde":`Cabo`,"cape verde":`Cabo`,"dominican republic":`Dominican`,"equatorial guinea":`Equatorial`,"marshall islands":`Marshall`,"saint vincent and the grenadines":`Saint Vincent`,"st. vincent and the grenadines":`Saint Vincent`,"saint kitts and nevis":`Saint Kitts And Nevis`,"st. kitts and nevis":`Saint Kitts And Nevis`,"sao tome and principe":`Sao Tome And Principe`},M=(()=>{let e={};for(let t of Object.keys(l))e[t.toLowerCase()]=t;for(let[t,n]of Object.entries(ne))l[n]&&(e[t]=n);return e})(),re=(()=>{try{return new Intl.DisplayNames([`en`],{type:`region`})}catch{return null}})();function ie(e){if(!e||!re)return null;let t;try{t=re.of(e.toUpperCase())}catch{return null}if(!t)return null;let n=M[t.toLowerCase()];return n?l[n]:null}function ae(e){return e?String(e).replace(/^\d{3,6}[\s,-]+/,``).replace(/\s+/g,` `).trim():``}function oe(e){if(!e)return null;if(e.includes(` - `)){let t=M[e.split(` - `)[1].trim().toLowerCase()];if(t)return l[t]}let t=e.split(`,`).map(e=>e.trim()).filter(Boolean);for(let e of t){let t=M[e.toLowerCase()];if(t)return l[t]}return null}var se=e=>`https://images.unsplash.com/photo-${e}?auto=format&fit=crop&w=1600&q=80`;function ce(e,t=[]){if(!e)return{quotes:[a.q],images:[se(a.i)],facts:[a.f]};let n=[],r=new Set,i=e=>{let t=(e||``).toUpperCase();t&&!r.has(t)&&(r.add(t),n.push(t))};i(e.countryCode);for(let e of t)i(e);let o=[];for(let e of n){let t=ie(e);t&&o.push(t)}if(o.length===0){let t=oe(e.country||``);t&&o.push(t)}if(o.length===0){let t=(e.country||``).split(`,`).map(e=>e.trim()).filter(Boolean),n=t[t.length-1]||e.country||``;o.push({q:`${n} is waiting for you.`,i:`1501854140801-50d01698950b`,f:`Did you know? ${n} is full of hidden gems waiting to be explored.`})}return{quotes:o.map(e=>e.q),images:o.map(e=>se(e.i)),facts:o.map(e=>e.f)}}function N(e){let t=document.createElement(`div`);t.className=`liquid-alert`,t.innerHTML=`<span>⚠️ ${e}</span>`,document.body.appendChild(t),requestAnimationFrame(()=>requestAnimationFrame(()=>t.classList.add(`show`))),setTimeout(()=>{t.classList.remove(`show`),t.classList.add(`dismiss`),setTimeout(()=>t.remove(),500)},3e3)}function P(e={}){let{title:t=`Are you sure?`,message:n=`This action cannot be undone.`,confirmText:r=`Delete`,confirmColor:i=`#ff3b30`,requireInput:a=!1,onConfirm:o=()=>{}}=e,{root:s,close:c}=O({variant:`confirm`,innerHTML:`
            <div style="text-align: center;">
                <h2 style="margin: 0; font-size: 2.2rem; letter-spacing: -0.06em; color: #ffffff;">${t}</h2>
                <p style="color: rgba(255,255,255,0.7); margin: 6px 0 0; font-size: var(--font-lg); font-weight: 500;">${n}</p>
            </div>

            ${a?`
                <div style="width: 100%; margin-bottom: var(--space-2);">
                    <p style="font-size: var(--font-xs); color: #ff3b30; font-weight: 800; text-transform: uppercase; margin-bottom: var(--space-3); letter-spacing: 0.1em; text-align: center;">Type "${a}" to confirm</p>
                    <input type="text" id="safetyInput" class="glass-input-modal" placeholder="Type here..." style="text-align: center; background: rgba(255,255,255,0.08); padding: 18px; border-radius: var(--radius-xl); font-size: var(--font-xl);" autofocus>
                </div>
            `:``}

            <div style="width: 100%; display: flex; flex-direction: column; gap: var(--space-2);">
                <button class="btn-primary" id="modalConfirmBtn" style="width: 100%; background: ${i}; padding: 18px; border-radius: var(--radius-xl); box-shadow: 0 10px 30px ${i}66; font-size: var(--font-xl);" ${a?`disabled`:``}>${r}</button>
                <button id="modalCancelBtn" style="width: 100%; padding: var(--space-2); font-weight: 600; background: transparent; border: none; color: rgba(255,255,255,0.4); font-size: var(--font-base); cursor: pointer;">Cancel</button>
            </div>
        `}),l=s.querySelector(`#modalConfirmBtn`),u=s.querySelector(`#modalCancelBtn`),d=s.querySelector(`#safetyInput`);a&&d&&(d.oninput=e=>{let t=e.target.value.trim().toUpperCase()===a.toUpperCase();l.disabled=!t,l.style.boxShadow=t?`0 15px 35px rgba(255, 59, 48, 0.4)`:`0 10px 30px ${i}66`}),l.onclick=()=>{o(),c()},u.onclick=()=>c()}function F(){return Math.random().toString(36).substr(2,9)}function I(e,t){let n=e.querySelector(t);if(!n)throw Error(`Element not found: ${t}`);return n}function L(e){return e==null?``:String(e).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`)}function le(e){if(!e)return``;let t=new Date(e+`T00:00:00Z`);return isNaN(t.getTime())?``:`${String(t.getUTCDate()).padStart(2,`0`)}-${String(t.getUTCMonth()+1).padStart(2,`0`)}-${t.getUTCFullYear()}`}var ue=e=>{let t=document.querySelectorAll(`.settings-tab-btn`),n=document.querySelectorAll(`.settings-section`);t.forEach(e=>e.classList.remove(`active`)),n.forEach(e=>e.classList.remove(`active`));let r=Array.from(t).find(t=>t.innerText.toLowerCase().includes(e.toLowerCase()));r&&r.classList.add(`active`);let i=document.getElementById(`settings-${e}`);i&&i.classList.add(`active`)},R=e=>{let t=document.getElementById(`persMenu`),n=document.getElementById(`persContent`),r=document.getElementById(`persCategories`);e===`menu`?(t&&(t.style.display=`grid`),n&&(n.style.display=`none`)):(t&&(t.style.display=`none`),n&&(n.style.display=`block`),r&&(r.style.display=`block`))},de=e=>{P({title:`Delete Category?`,message:`This will not affect existing expenses, but you won't be able to select this category again.`,confirmText:`Delete`,onConfirm:()=>{b.categories=b.categories.filter(t=>t.id!==e),T(`state:changed`),Jt(),q(`personalization`),setTimeout(()=>R(`categories`),50)}})};function fe(){let e=document.createElement(`div`);function t(){let e=[`label`,`date`,`value`,`who`,`category`],t=[`country`,`currency`,`splits`,`isSettlement`],n=new Set((b.customFormat||[]).map(e=>e.variable)),r=b.savedFormats||[];return`
            <div style="display:flex; flex-wrap:wrap; gap:var(--space-2); margin-bottom:var(--space-6);">
                ${e.map(e=>{let t=n.has(e);return`<span class="status-chip${t?` is-done`:``}">
                        ${t?`✓`:`★`} ${e.toUpperCase()}
                    </span>`}).join(``)}
            </div>

            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--glass-border); border-radius: var(--radius-xl); overflow: hidden; margin-bottom: var(--space-6);">
                <table class="mapping-table">
                    <thead>
                        <tr>
                            <th class="is-left">Variable</th>
                            <th class="is-left">Excel Column</th>
                            <th class="is-center">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(b.customFormat||[]).length===0?`<tr><td class="empty-cell" colspan="3">No mappings yet.</td></tr>`:(b.customFormat||[]).map(e=>`
                            <tr>
                                <td style="font-weight:700;">${e.variable}</td>
                                <td><span class="col-tag">${e.column}</span></td>
                                <td class="is-center">
                                    <button class="icon-x-btn remove-mapping-btn" data-variable="${e.variable}">&times;</button>
                                </td>
                            </tr>
                        `).join(``)}
                    </tbody>
                </table>
            </div>

            <div style="display:flex; gap:var(--space-4); align-items:flex-end; flex-wrap:wrap; margin-bottom:var(--space-8);">
                <div style="flex:1; min-width:150px;">
                    <label class="compact-form-label" style="font-size:var(--font-xs); font-weight:800; color:var(--text-secondary);">VARIABLE</label>
                    <select id="mapVarSelect" class="glass-input" style="width:100%;">
                        <option value="">Select...</option>
                        ${e.concat(t).filter(e=>!n.has(e)).map(t=>`<option value="${t}">${e.includes(t)?`★ `:``}${t}</option>`).join(``)}
                    </select>
                </div>
                <div style="flex:1; min-width:120px;">
                    <label class="compact-form-label" style="font-size:var(--font-xs); font-weight:800; color:var(--text-secondary);">COLUMN</label>
                    <select id="mapColSelect" class="glass-input" style="width:100%;">
                        <option value="">Col...</option>
                        ${`ABCDEFGHIJKLMNOPQRSTUVWXYZ`.split(``).map(e=>`<option value="${e}">${e}</option>`).join(``)}
                    </select>
                </div>
                <button class="btn btn-liquid-glass" id="addFormatMappingBtn" style="padding: var(--space-3) var(--space-6);">Map Field</button>
            </div>

            <div style="border-top: 1px solid var(--glass-border); padding-top: var(--space-8);">
                <h3 style="margin-top:0;">Saved Formats (${r.length}/5)</h3>
                <div style="display:grid; gap:var(--space-3);">
                    ${r.map(e=>`
                        <div class="saved-format-row">
                            <div style="font-weight:700;">${e.name}</div>
                            <div style="display:flex; gap:var(--space-2);">
                                <button class="themed-block-btn themed-block-btn--sm edit-saved-format-btn" data-format-id="${e.id}" style="--accent: 0,113,227;">Edit</button>
                                <button class="themed-block-btn themed-block-btn--sm delete-saved-format-btn" data-format-id="${e.id}" style="--accent: 255,59,48;">Delete</button>
                            </div>
                        </div>
                    `).join(``)}
                    ${r.length<5?`
                        <div style="display:flex; gap:var(--space-3); margin-top:var(--space-3);">
                            <input type="text" id="formatNameInput" class="glass-input" placeholder="Name this format..." style="flex:1;">
                            <button class="btn-primary" id="saveCustomFormatBtn">Save Format</button>
                        </div>
                    `:``}
                </div>
            </div>
        `}let n=(e=`menu`)=>{let n=e===`menu`,r=e===`reset`,i=e===`format`;return`
            <div class="ai-page-header">
                <h1 class="gradient-text" style="--g-from: #1a6b3c; --g-to: #34c759;">System Control</h1>
                <p>Manage your travel data, custom formats, and core preferences.</p>
            </div>

            ${n?`
                <div class="settings-grid">
                    <button type="button" class="card-button-reset card glass management-card settings-tab-card" data-tab="general">
                        <h2 class="card-title" style="color: var(--accent-blue); margin: 0;">General Settings</h2>
                        <p style="color: var(--text-secondary); margin: 8px 0 0;">Customise per-pill filters for the home map (minimum rating, etc.).</p>
                        <div style="margin-top: 20px; color: var(--accent-blue); font-weight: 700; font-size: 0.85rem;">Configure &rarr;</div>
                    </button>

                    <button type="button" class="card-button-reset card glass management-card settings-tab-card" data-tab="format">
                        <h2 class="card-title" style="color: #ff9500; margin: 0;">Format Options</h2>
                        <p style="color: var(--text-secondary); margin: 8px 0 0;">Configure Excel import mappings and global data formats.</p>
                        <div style="margin-top: 20px; color: #ff9500; font-weight: 700; font-size: 0.85rem;">Configure &rarr;</div>
                    </button>

                    <button type="button" class="card-button-reset card glass management-card danger-card settings-tab-card" data-tab="reset">
                        <div class="danger-glow pulse-red"></div>
                        <h2 class="card-title" style="color: #ff3b30; margin: 0;">Data Management</h2>
                        <p style="color: var(--text-secondary); margin: 8px 0 0;">Wipe specific data categories or perform a factory reset.</p>
                        <div style="margin-top: 20px; color: #ff3b30; font-weight: 700; font-size: 0.85rem;">Manage Data &rarr;</div>
                    </button>
                </div>
            `:`
                <button class="btn btn-small btn-liquid-glass settings-tab-card" data-tab="menu" style="margin-bottom: 24px; padding: 10px 20px; border-radius: 14px;">&larr; Back to Control Center</button>

                ${e===`general`?(()=>{let e=b.preferences?.poiFilters||{},t=b.preferences?.poiAnchoring||{},n=b.preferences?.poiVisible||{},r=[0,3,3.5,4,4.5];return`
                        <div class="card glass" style="padding: 32px; border-radius: 28px;">
                            <h2 style="color: var(--accent-blue); margin-top: 0;">Map pill filters</h2>
                            <p style="color: var(--text-secondary); margin-bottom: 16px;"><strong>Show on Home</strong> (the right-side switch) toggles whether each pill appears in the home map's pill row. Useful for hiding categories you never use so the row stays compact.</p>
                            <p style="color: var(--text-secondary); margin-bottom: 16px;"><strong>Minimum rating</strong> hides results below the chosen ★. Restaurants and Hotels default to 4★+ (rating is a meaningful quality signal there); the rest default to "Any rating".</p>
                            <p style="color: var(--text-secondary); margin-bottom: 24px;"><strong>Search anchor</strong> picks where each pill searches from. <em>Day-aware</em> uses the day you've set as search center on the Home page (falls back to the trip's genesis pin). <em>Trip-wide</em> always anchors on the genesis pin so the 50 km wide search covers the whole trip — better for sparse "where are these across my whole trip" categories like Medical, Sports, Govt, Schools, Public transit.</p>
                            <div class="poi-filter-list">
                                ${Be.filter(e=>e.placesType).map(i=>{let a=typeof e[i.key]?.minRating==`number`?e[i.key].minRating:i.defaultMinRating,o=r.map(e=>`
                                <option value="${e}" ${e===a?`selected`:``}>${e===0?`Any rating`:`${e}★ +`}</option>
                            `).join(``),s=t[i.key],c=s===`genesis`||s===`epicenter`?s:i.useGenesisAlways?`genesis`:`epicenter`,l=i.useGenesisAlways?`genesis`:`epicenter`,u=`
                                <option value="epicenter" ${c===`epicenter`?`selected`:``}>📍 Day-aware</option>
                                <option value="genesis"   ${c===`genesis`?`selected`:``}>🌐 Trip-wide</option>
                            `,d=n[i.key]!==!1,f=a!==i.defaultMinRating||(s===`genesis`||s===`epicenter`)&&s!==l||!d;return`
                                <div class="poi-filter-row${d?``:` poi-filter-row--hidden`}">
                                    <span class="poi-filter-row__icon">${i.icon}</span>
                                    <div class="poi-filter-row__body">
                                        <div class="poi-filter-row__label">${L(i.label)}</div>
                                        <div class="poi-filter-row__hint">${L(i.tooltip)}</div>
                                    </div>
                                    <select class="poi-anchor-mode" data-poi="${i.key}" aria-label="Search anchor for ${L(i.label)}" title="Day-aware = uses the day you've picked as search center on Home (falls back to genesis). Trip-wide = always anchored on the trip's genesis pin.">
                                        ${u}
                                    </select>
                                    <select class="poi-filter-rating" data-poi="${i.key}" aria-label="Minimum rating for ${L(i.label)}">
                                        ${o}
                                    </select>
                                    <span class="poi-filter-row__default" title="Defaults: ${i.defaultMinRating===0?`Any rating`:i.defaultMinRating+`★+`} / ${l===`genesis`?`Trip-wide`:`Day-aware`} / shown">
                                        ${f?`<button type="button" class="poi-filter-reset" data-poi="`+i.key+`" title="Reset rating, anchor, and visibility to default">Reset</button>`:`<span class="muted">Default</span>`}
                                    </span>
                                    <label class="switch poi-visibility-switch" title="${d?`Visible on the home pill row — switch off to hide.`:`Hidden from the home pill row — switch on to show.`}">
                                        <input type="checkbox" class="poi-visibility-toggle" data-poi="${i.key}" ${d?`checked`:``}>
                                        <span class="slider"></span>
                                    </label>
                                </div>
                            `}).join(``)}
                            </div>
                            <p style="color: var(--text-secondary); margin: 24px 0 0; font-size: 0.85rem;">Visibility changes take effect on next Home navigation. Filter / anchor changes apply on the next pill toggle. Reset returns rating, anchor, AND visibility to the pill's defaults.</p>
                        </div>
                    `})():``}

                ${r?`
                    <div class="settings-grid">
                        <div class="card glass" style="padding: var(--space-6);">
                            <h3 style="color: #ff9500; margin-top: 0;">Trips & Days</h3>
                            <p class="muted-meta">Remove all trips, itineraries, and daily logs.</p>
                            <button class="themed-block-btn confirm-reset-btn" data-reset-type="trips" style="--accent: 255,149,0;">Delete All Trips</button>
                        </div>
                        <div class="card glass" style="padding: var(--space-6);">
                            <h3 style="color: #5856d6; margin-top: 0;">Categories</h3>
                            <p class="muted-meta">Reset custom expense categories to defaults.</p>
                            <button class="themed-block-btn confirm-reset-btn" data-reset-type="categories" style="--accent: 88,86,214;">Restore Defaults</button>
                        </div>
                        <div class="card glass danger-card" style="padding: var(--space-6); border-color: rgba(255, 59, 48, 0.3);">
                            <h3 style="color: #ff3b30; margin-top: 0;">Factory Reset</h3>
                            <p class="muted-meta">Permanently wipe every trace of data from the app.</p>
                            <button class="btn-confirm-danger confirm-reset-btn" data-reset-type="app" style="font-size: var(--font-sm); padding: var(--space-3);">Erase Everything</button>
                        </div>
                    </div>
                `:``}

                ${i?`
                    <div class="card glass" style="padding: 32px; border-radius: 28px;">
                        <h2 style="color: #ff9500; margin-top: 0;">Custom Excel Mapping</h2>
                        <p style="color: var(--text-secondary); margin-bottom: 24px;">Define how internal app fields map to Excel columns for seamless imports.</p>
                        
                        <div id="mappingTableContainer">
                            ${t()}
                        </div>
                    </div>
                `:``}
            `}
        `},r=t=>{e.innerHTML=n(t)},i=e=>{P({trips:{title:`Wipe All Trips?`,message:`This permanently deletes every trip, day log, and itinerary.`,confirmText:`Delete Trips`,onConfirm:async()=>{if(b.trips=[],b.archivedTrips=[],b.tripDays=[],b.expenses=[],b.budgets=[],b.activeTripId=null,T(`state:changed`),b.user)try{await Y(`/api/user-data`,{method:`DELETE`,headers:{"Content-Type":`application/json`},body:JSON.stringify({})})}catch(e){console.error(`Server wipe failed`,e)}r(`reset`)}},categories:{title:`Reset Categories?`,message:`Reverts all expense categories to the system defaults.`,confirmText:`Restore Defaults`,onConfirm:()=>{b.categories=[{id:`c1`,name:`Food`,icon:`🍔`,color:`#ff3b30`},{id:`c2`,name:`Transport`,icon:`✈️`,color:`#007aff`},{id:`c3`,name:`Accommodation`,icon:`🏨`,color:`#5856d6`}],T(`state:changed`),Jt(),r(`reset`)}},app:{title:`Factory Reset`,message:`Absolute destruction. This wipes EVERY bit of data from the application.`,confirmText:`ERASE EVERYTHING`,onConfirm:async()=>{if(b.user)try{await Y(`/api/user-data`,{method:`DELETE`,headers:{"Content-Type":`application/json`},body:JSON.stringify({})})}catch(e){console.error(`Server wipe failed`,e)}b.trips=[],b.archivedTrips=[],b.tripDays=[],b.expenses=[],b.budgets=[],b.categories=[],b.activeTripId=null,b.user=null,b.notifications=[],b.hasLoggedInBefore=!1,T(`state:changed`),localStorage.clear(),location.reload()}}}[e])},a=()=>{let e=document.getElementById(`mapVarSelect`)?.value,t=document.getElementById(`mapColSelect`)?.value;!e||!t||(b.customFormat=b.customFormat||[],!b.customFormat.some(t=>t.variable===e)&&(b.customFormat.push({variable:e,column:t}),T(`state:changed`),r(`format`)))},o=e=>{b.customFormat=(b.customFormat||[]).filter(t=>t.variable!==e),T(`state:changed`),r(`format`)},s=()=>{let e=[`label`,`date`,`value`,`who`,`category`],t=b.customFormat||[],n=new Set(t.map(e=>e.variable===`categoryId`?`category`:e.variable)),i=e.filter(e=>!n.has(e));if(i.length>0)return alert(`Missing required fields: ${i.join(`, `)}`);let a=(document.getElementById(`formatNameInput`)?.value||``).trim();a&&(b.savedFormats=b.savedFormats||[],b.savedFormats.push({id:F(),name:a,mappings:[...t]}),b.customFormat=[],T(`state:changed`),r(`format`))},c=e=>{P({title:`Delete Format?`,message:`This mapping will no longer be available for imports.`,confirmText:`Delete`,onConfirm:()=>{b.savedFormats=(b.savedFormats||[]).filter(t=>t.id!==e),T(`state:changed`),r(`format`)}})},l=e=>{let t=(b.savedFormats||[]).find(t=>t.id===e);t&&(b.customFormat=[...t.mappings],b.savedFormats=(b.savedFormats||[]).filter(t=>t.id!==e),T(`state:changed`),r(`format`),setTimeout(()=>{let e=document.getElementById(`formatNameInput`);e&&(e.value=t.name)},50))};e.innerHTML=n(`menu`),e.addEventListener(`click`,e=>{let t=e.target;if(!t)return;let n=t.closest(`.settings-tab-card`);if(n?.dataset.tab){r(n.dataset.tab);return}let d=t.closest(`.confirm-reset-btn`);if(d?.dataset.resetType){i(d.dataset.resetType);return}let f=t.closest(`.remove-mapping-btn`);if(f?.dataset.variable){o(f.dataset.variable);return}let p=t.closest(`.edit-saved-format-btn`);if(p?.dataset.formatId){l(p.dataset.formatId);return}let m=t.closest(`.delete-saved-format-btn`);if(m?.dataset.formatId){c(m.dataset.formatId);return}if(t.closest(`#addFormatMappingBtn`)){a();return}if(t.closest(`#saveCustomFormatBtn`)){s();return}let h=t.closest(`.poi-filter-reset`);if(h?.dataset.poi){u(),delete b.preferences.poiFilters[h.dataset.poi],delete b.preferences.poiAnchoring[h.dataset.poi],delete b.preferences.poiVisible[h.dataset.poi],T(`state:changed`),r(`general`);return}}),e.addEventListener(`change`,e=>{let t=e.target;if(!t)return;let n=t.closest(`.poi-filter-rating`);if(n){let e=n.dataset.poi;if(!e)return;let t=parseFloat(n.value);u(),b.preferences.poiFilters[e]={minRating:t},T(`state:changed`),r(`general`);return}let i=t.closest(`.poi-anchor-mode`);if(i){let e=i.dataset.poi;if(!e)return;let t=i.value;if(t!==`genesis`&&t!==`epicenter`)return;u(),b.preferences.poiAnchoring[e]=t,T(`state:changed`),r(`general`);return}let a=t.closest(`.poi-visibility-toggle`);if(a){let e=a.dataset.poi;if(!e)return;let t=a.checked;u(),t?delete b.preferences.poiVisible[e]:b.preferences.poiVisible[e]=!1,T(`state:changed`),r(`general`);return}});function u(){b.preferences||={mapDefaultPois:[`sights`,`parks`,`transit`],poiFilters:{},pillEpicenters:{},poiAnchoring:{},poiVisible:{}},(!b.preferences.poiFilters||typeof b.preferences.poiFilters!=`object`)&&(b.preferences.poiFilters={}),(!b.preferences.poiAnchoring||typeof b.preferences.poiAnchoring!=`object`)&&(b.preferences.poiAnchoring={}),(!b.preferences.poiVisible||typeof b.preferences.poiVisible!=`object`)&&(b.preferences.poiVisible={})}return e}function pe(e){let t=b.categories.find(t=>t.id===e);if(!t)return;let{root:n,close:r}=O({variant:`glass-light`,cardStyle:`width: 420px;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-5); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">Edit Category</h2>
            <form id="editCategoryForm" style="display: flex; flex-direction: column; gap: var(--space-4);">
                <div style="display: flex; gap: var(--space-3); align-items: center;">
                    <select id="editCatIcon" class="glass-input" style="width: 80px;">${`🍷.🏨.✈️.🚕.🍕.🎟️.🛍️.🍦.🥐.🏛️.🏖️.🎢.🚠.🚌.🚆.🌍.🗺️.🎒.📸.☕.🍔.🛒.🎨.💊.🎭.🚗`.split(`.`).map(e=>`<option value="${e}" ${e===t.icon?`selected`:``}>${e}</option>`).join(``)}</select>
                    <input type="text" id="editCatName" class="glass-input" value="${L(t.name)}" placeholder="Category name" required style="flex: 1;">
                    <input type="color" id="editCatColor" class="glass-input" value="${L(t.color)}" style="width: 50px; padding: 2px;">
                </div>
                <div style="display: flex; gap: var(--space-3); margin-top: var(--space-2);">
                    <button type="submit" class="btn-primary" style="flex: 2;">Save Changes</button>
                    <button type="button" id="cancelEditCatBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">Cancel</button>
                </div>
            </form>
        `});I(n,`#cancelEditCatBtn`).onclick=()=>r(),I(n,`#editCategoryForm`).onsubmit=e=>{e.preventDefault();let i=I(n,`#editCatIcon`).value,a=I(n,`#editCatName`).value.trim(),o=I(n,`#editCatColor`).value;a&&(t.icon=i,t.name=a,t.color=o,T(`state:changed`),Jt(),r(),q(`personalization`),setTimeout(()=>R(`categories`),50))}}function me(){let e=document.createElement(`div`);return e.innerHTML=`
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #1a6b3c; --g-to: #34c759;">Personalization</h1>
            <p>Customize your experience and categories. Manage friends in the Friends tab; add companions per-trip from the Home page.</p>
        </div>

        <div id="persMenu" class="grid-2">
            <button type="button" class="card-button-reset card glass card-glow-blue pers-tab-card" data-tab="categories">
                <h2 class="card-title" style="color: var(--accent-blue);">Manage Categories</h2>
                <p class="text-muted">Customize expense categories, icons, and colors.</p>
            </button>
        </div>

        <div id="persContent" style="display: none;">
            <button class="btn btn-small btn-liquid-glass pers-tab-card" data-tab="menu" style="margin-bottom: 20px;">&larr; Back to Personalization</button>

            <div id="persCategories" style="display: none;">
                <div class="card glass card-glow-blue">
                    <h2 class="card-title" style="color: var(--accent-blue);">Categories</h2>
                    <table class="compact-table" style="margin-bottom: var(--space-5);">
                        <thead>
                            <tr>
                                <th class="is-left">Name</th>
                                <th class="is-right">Color</th>
                                <th class="is-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${b.categories.map(e=>`
        <tr>
            <td>${e.icon} ${L(e.name)}</td>
            <td class="is-right"><span class="color-swatch" style="background: ${e.color}"></span></td>
            <td class="is-right">
                <button class="btn-x-bare edit-category-btn" data-category-id="${e.id}" aria-label="Edit category" style="margin-right: var(--space-2);">✏️</button>
                <button class="btn-x-bare delete-category-btn" data-category-id="${e.id}" aria-label="Delete category">✕</button>
            </td>
        </tr>
    `).join(``)}
                        </tbody>
                    </table>

                    <div class="section-divider">
                        <h3 style="margin-bottom: var(--space-3); font-size: var(--font-lg);">Add New Category</h3>
                        <div style="display:flex; gap: var(--space-3); flex-wrap: wrap;">
                            <select id="catIcon" class="glass-input" style="width: 80px;">
                                <option value="🍷">🍷</option><option value="🏨">🏨</option><option value="✈️">✈️</option><option value="🚕">🚕</option><option value="🍕">🍕</option>
                                <option value="🎟️">🎟️</option><option value="🛍️">🛍️</option><option value="🍦">🍦</option><option value="🥐">🥐</option><option value="🏛️">🏛️</option>
                                <option value="🏖️">🏖️</option><option value="🎢">🎢</option><option value="🚠">🚠</option><option value="🚌">🚌</option><option value="🚆">🚆</option>
                                <option value="🌍">🌍</option><option value="🗺️">🗺️</option><option value="🎒">🎒</option><option value="📸">📸</option><option value="☕">☕</option>
                            </select>
                            <input type="text" id="catName" class="glass-input" placeholder="Category Name" style="flex:1; min-width: 150px;">
                            <input type="color" id="catColor" class="glass-input" value="#ff3b30" style="width: 50px; padding: 2px;">
                            <button id="addCatBtn" class="btn-primary" style="padding: var(--space-3) var(--space-5);">Add</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `,e.addEventListener(`click`,e=>{let t=e.target;if(!t)return;let n=t.closest(`.pers-tab-card`);if(n?.dataset.tab){R(n.dataset.tab);return}let r=t.closest(`.edit-category-btn`);if(r?.dataset.categoryId){pe(r.dataset.categoryId);return}let i=t.closest(`.delete-category-btn`);if(i?.dataset.categoryId){de(i.dataset.categoryId);return}}),setTimeout(()=>{let t=e.querySelector(`#addCatBtn`);t&&t.addEventListener(`click`,()=>{let t=I(e,`#catIcon`).value,n=I(e,`#catName`).value.trim(),r=I(e,`#catColor`).value;n&&(b.categories.push({id:F(),name:n,icon:t,color:r}),T(`state:changed`),Jt(),q(`personalization`),setTimeout(()=>R(`categories`),50))})},0),e}var z=`planner`,he=`budgeteer`,ge=`relaxer`;function _e(e){if(!e)return!1;let t=b.user?.id;return t?e.ownerId===t||e.user_id===t:!1}function ve(e){return e?_e(e)?z:e.myRole??null:null}function ye(e){return ve(e)===z}function be(e){let t=ve(e);return t===`planner`||t===`budgeteer`}function xe(e){return _e(e)}function Se(e){return _e(e)}function Ce(e,t,n,r){let i=[];if(!t||!n)return i;let a=new Date(t+`T00:00:00`),o=new Date(n+`T00:00:00`);if(isNaN(a.getTime())||isNaN(o.getTime())||o<a)return i;let s=r;for(let t=new Date(a);t<=o;t.setDate(t.getDate()+1)){let n=t.toISOString().split(`T`)[0],r={id:F(),tripId:e,name:`Day ${s}`,date:n,dayNumber:s,photos:[],notes:``,plan:{morning:``,afternoon:``,evening:``},lat:null,lng:null};i.push(r),s+=1}return i}function we({placeInput:e,hint:t,submitBtn:n,initialPlace:r=null}){let i=r,a=e=>{t.classList.remove(`form-hint--success`,`form-hint--warn`),e&&t.classList.add(`form-hint--${e}`)},o=e=>{i=e,e?(n.disabled=!1,t.textContent=`📍 ${e.name}`,a(`success`)):(n.disabled=!0,t.textContent=`Pick a suggestion to confirm the location.`,a(null))};if(r&&(e.value=r.name,t.textContent=`📍 ${r.name}`,a(null),n.disabled=!1),typeof google>`u`||!google.maps||!google.maps.places)return t.textContent=`⚠ Google Maps failed to load. Check your API key + billing.`,a(`warn`),e.oninput=()=>{let t=e.value.trim();t.length>1?o({placeId:``,name:t,lat:0,lng:0,viewport:null,types:[],countryCode:null}):o(null)},{getPicked:()=>i};let s=new google.maps.places.Autocomplete(e,{fields:[`place_id`,`name`,`formatted_address`,`geometry`,`types`,`address_components`]});return s.addListener(`place_changed`,()=>{let t=s.getPlace();if(!t||!t.geometry||!t.geometry.location){o(null);return}let n=t.geometry.location,r=t.geometry.viewport,i=(t.address_components||[]).find(e=>(e.types||[]).includes(`country`)),a=i&&i.short_name||null;o({placeId:t.place_id||``,name:t.formatted_address||t.name||e.value,lat:n.lat(),lng:n.lng(),viewport:r?{south:r.getSouthWest().lat(),west:r.getSouthWest().lng(),north:r.getNorthEast().lat(),east:r.getNorthEast().lng()}:null,types:t.types||[],countryCode:a})}),e.addEventListener(`input`,()=>{i&&e.value!==i.name&&o(null)}),{getPicked:()=>i}}var Te=()=>{let{root:e,close:t}=O({variant:`glass`,cardStyle:`width: 420px;`,innerHTML:`
            <h2 class="card-title" style="font-size: var(--font-3xl); margin-bottom: var(--space-6); color: #ffffff; letter-spacing: -0.06em; font-weight: 800; text-align: center;">New Trip</h2>
            <form id="newTripForm" style="display: flex; flex-direction: column; align-items: center; width: 100%;">
                <div style="margin-bottom: var(--space-4); width: 100%;">
                    <label class="form-label">Adventure Name</label>
                    <input type="text" id="tripName" class="glass-input-modal" placeholder="e.g. Summer in Tuscany" required>
                </div>
                <div style="margin-bottom: var(--space-4); width: 100%; position: relative;">
                    <label class="form-label">Destination</label>
                    <input type="text" id="tripPlaceInput" class="glass-input-modal" placeholder="Search a country, city, or address..." autocomplete="off">
                    <p id="tripPlaceHint" class="form-hint">Pick a suggestion to confirm the location.</p>
                </div>
                <div style="display: flex; gap: var(--space-3); width: 100%; margin-bottom: var(--space-2);">
                    <div style="flex: 1;">
                        <label class="form-label">Start date <span style="opacity: 0.5; font-weight: 500;">(optional)</span></label>
                        <input type="date" id="tripStartDate" class="glass-input-modal">
                    </div>
                    <div style="flex: 1;">
                        <label class="form-label">End date <span style="opacity: 0.5; font-weight: 500;">(optional)</span></label>
                        <input type="date" id="tripEndDate" class="glass-input-modal">
                    </div>
                </div>
                <p class="form-hint" style="margin-bottom: var(--space-4); width: 100%;">If you fill these in, we'll create one empty Path day per date — you can pin places later.</p>
                <div style="display: flex; gap: var(--space-3); width: 100%; margin-top: var(--space-4);">
                    <button type="submit" id="newTripSubmitBtn" class="btn-primary" style="flex: 2;" disabled>Create Trip</button>
                    <button type="button" id="cancelTripBtn" class="btn-ghost" style="flex: 1;">Cancel</button>
                </div>
            </form>
        `}),{getPicked:n}=we({placeInput:I(e,`#tripPlaceInput`),hint:I(e,`#tripPlaceHint`),submitBtn:I(e,`#newTripSubmitBtn`)});I(e,`#cancelTripBtn`).onclick=()=>t(),I(e,`#newTripForm`).onsubmit=r=>{r.preventDefault();let i=n();if(!i){N(`Pick a destination from the suggestions.`);return}let a=F(),o=I(e,`#tripName`).value,s=b.user?.name?.split(` `)[0]||`Me`,c=b.user?.id?[{name:s,linkedUserId:b.user.id}]:[],l=b.user?.id?[{userId:b.user.id,role:z,archived:!1,name:b.user.name??null,picture:b.user.picture??null}]:[],u={id:a,name:o,country:i.name,placeId:i.placeId,lat:i.lat,lng:i.lng,viewport:i.viewport,placeTypes:i.types,countryCode:i.countryCode,budget:0,isArchived:!1,ownerId:b.user?.id,myRole:z,myArchived:!1,companions:c,members:l};b.trips.push(u),b.activeTripId=a;let d=I(e,`#tripStartDate`).value,f=I(e,`#tripEndDate`).value,p=Ce(a,d,f,1);p.length>0&&b.tripDays.push(...p),T(`state:changed`),Q(u),p.forEach(e=>$(e)),t(),q(`home`)}},Ee=e=>{if(!e)return;let{root:t,close:n}=O({variant:`glass`,cardStyle:`width: 420px;`,innerHTML:`
            <h2 class="card-title" style="font-size: var(--font-3xl); margin-bottom: var(--space-6); color: #ffffff; letter-spacing: -0.06em; font-weight: 800; text-align: center;">Edit Trip</h2>
            <form id="editTripForm" style="display: flex; flex-direction: column; align-items: center; width: 100%;">
                <div style="margin-bottom: var(--space-4); width: 100%;">
                    <label class="form-label">Adventure Name</label>
                    <input type="text" id="editTripName" class="glass-input-modal" required>
                </div>
                <div style="margin-bottom: var(--space-4); width: 100%; position: relative;">
                    <label class="form-label">Destination</label>
                    <input type="text" id="editTripPlaceInput" class="glass-input-modal" placeholder="Search a country, city, or address..." autocomplete="off">
                    <p id="editTripPlaceHint" class="form-hint">Pick a new suggestion to change the location, or just rename.</p>
                </div>
                <div style="display: flex; gap: var(--space-3); width: 100%; margin-bottom: var(--space-2);">
                    <div style="flex: 1;">
                        <label class="form-label">Start date <span style="opacity: 0.5; font-weight: 500;">(optional)</span></label>
                        <input type="date" id="editTripStartDate" class="glass-input-modal">
                    </div>
                    <div style="flex: 1;">
                        <label class="form-label">End date <span style="opacity: 0.5; font-weight: 500;">(optional)</span></label>
                        <input type="date" id="editTripEndDate" class="glass-input-modal">
                    </div>
                </div>
                <p id="editTripDateHint" class="form-hint" style="margin-bottom: var(--space-4); width: 100%;"></p>
                <div style="display: flex; gap: var(--space-3); width: 100%; margin-top: var(--space-4);">
                    <button type="submit" id="editTripSubmitBtn" class="btn-primary" style="flex: 2;">Save Changes</button>
                    <button type="button" id="cancelEditTripBtn" class="btn-ghost" style="flex: 1;">Cancel</button>
                </div>
            </form>
        `}),r=I(t,`#editTripName`);r.value=e.name||``;let i=(b.tripDays||[]).filter(t=>t.tripId===e.id&&t.dayNumber>0).sort((e,t)=>e.dayNumber-t.dayNumber),a=I(t,`#editTripStartDate`),o=I(t,`#editTripEndDate`),s=I(t,`#editTripDateHint`);i.length>0?(a.value=i[0].date||``,o.value=i[i.length-1].date||``,s.textContent=`This trip already has Path days — edit each day individually to change dates.`):s.textContent=`If you fill these in, we'll create one empty Path day per date — you can pin places later.`;let c=I(t,`#editTripPlaceInput`),l=I(t,`#editTripPlaceHint`),u=I(t,`#editTripSubmitBtn`),d=e.placeId||e.lat?{placeId:e.placeId||``,name:e.country||``,lat:e.lat||0,lng:e.lng||0,viewport:e.viewport||null,types:e.placeTypes||[],countryCode:e.countryCode||null}:null,{getPicked:f}=we({placeInput:c,hint:l,submitBtn:u,initialPlace:d});I(t,`#cancelEditTripBtn`).onclick=()=>n(),I(t,`#editTripForm`).onsubmit=t=>{t.preventDefault();let s=r.value.trim();if(!s){N(`Trip name can't be empty.`);return}let c=f();if(!c){N(`Pick a destination from the suggestions.`);return}let l=c.placeId!==(d?.placeId||``)||c.name!==(d?.name||``);if(e.name=s,e.country=c.name,e.placeId=c.placeId,e.lat=c.lat,e.lng=c.lng,e.viewport=c.viewport,e.placeTypes=c.types,e.countryCode=c.countryCode,l&&b.mapViews&&(delete b.mapViews[e.id],delete b.mapViews[e.id+`_ai`]),l){let t=(b.tripDays||[]).find(t=>t.tripId===e.id&&t.dayNumber===0);t&&(t.lat=c.lat,t.lng=c.lng,t.lon=c.lng)}let u=[];i.length===0&&(u=Ce(e.id,a.value,o.value,1),u.length>0&&b.tripDays.push(...u)),T(`state:changed`),Q(e),u.forEach(e=>$(e)),n(),q(`home`,null,!0)}},De=()=>{if(!b.activeTripId){N(`Please create a trip before adding days.`);return}let e=(b.tripDays||[]).filter(e=>e.tripId===b.activeTripId).sort((e,t)=>e.dayNumber-t.dayNumber),t=e.filter(e=>e.dayNumber>0),n=(t.length>0?t[t.length-1].dayNumber:0)+1,r=``;if(e.length>0){let t=e[e.length-1];if(t.date){let e=new Date(t.date);e.setDate(e.getDate()+1),r=e.toISOString().split(`T`)[0]}}let{root:i,close:a}=O({variant:`glass-light`,cardStyle:`width: 400px;`,innerHTML:`
            <div style="display: flex; align-items: center; justify-content: center; gap: var(--space-3); margin-bottom: var(--space-5);">
                <div style="background: var(--accent-blue); color: white; width: 28px; height: 28px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: var(--font-base);">${n}</div>
                <h2 class="card-title" style="font-size: var(--font-3xl); margin: 0; color: #000000; letter-spacing: -0.06em; font-weight: 800; text-align: center;">Add Day</h2>
            </div>
            <form id="addDayForm" style="display: flex; flex-direction: column; width: 100%;">
                <div style="margin-bottom: var(--space-4);">
                    <label class="form-label" style="color: rgba(0,0,0,0.5);">Where are you going?</label>
                    <input type="text" id="dayName" class="glass-input-modal" style="color: #000; background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.1);" value="Day ${n}" placeholder="e.g. Exploring Rome" required autofocus>
                </div>
                <div style="margin-bottom: var(--space-6);">
                    <label class="form-label" style="color: rgba(0,0,0,0.5);">Date ${r?`(Auto)`:``}</label>
                    <input type="date" id="dayDate" class="glass-input-modal" style="color: #000; background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.1);" value="${r}" required>
                </div>
                <div style="display: flex; gap: var(--space-2); width: 100%;">
                    <button type="submit" class="btn-primary" style="flex: 2;">Confirm</button>
                    <button type="button" id="cancelDayBtn" class="btn-ghost" style="flex: 1; background: rgba(0,0,0,0.05); color: #000; border: none;">Cancel</button>
                </div>
            </form>
        `}),o=b.activeTripId;I(i,`#cancelDayBtn`).onclick=()=>a(),I(i,`#addDayForm`).onsubmit=async e=>{e.preventDefault();let t={id:F(),tripId:o,name:I(i,`#dayName`).value,date:I(i,`#dayDate`).value,dayNumber:n,photos:[],notes:``,plan:{morning:``,afternoon:``,evening:``}};b.tripDays.push(t),T(`state:changed`),await $(t),a(),q(`home`)}},Oe=e=>{let t=b.trips.find(t=>t.id===e);if(!t)return;if(!xe(t)){ke(e);return}Array.isArray(t.companions)||(t.companions=[]);let n=b.user?.id,r=new Set(b.expenses.filter(t=>t.tripId===e).flatMap(e=>[e.who,...Object.keys(e.splits||{})]).filter(Boolean)),i=new Map((t.members||[]).map(e=>[e.userId,e])),a=[],o=e=>e===`planner`?`Planner`:e===`budgeteer`?`Budgeteer`:e===`relaxer`?`Relaxer`:e,s=e=>{let t=r.has(e.name),n=e.linkedUserId,a=n?i.get(n):null,s=``;s=a?`<span class="companion-link-pill companion-link-pill--linked" title="Trip invitation accepted">${L(o(a.role))}</span>`:n?`<span class="companion-link-pill companion-link-pill--pending" title="Trip invitation pending">⏳ Pending</span>`:`<span class="companion-link-pill companion-link-pill--companion">Unlinked</span>`;let c=n?``:`<button type="button" class="btn-link-action picker-link-btn" data-name="${L(e.name)}">🔗 Link to friend</button>`,l=t?`<span class="companion-row__lock" title="Has expenses on this trip — can't remove">🔒</span>`:`<button type="button" class="btn-x-bare picker-remove-btn" data-name="${L(e.name)}" title="Remove from trip">✕</button>`;return`
            <div class="companion-row" data-name="${L(e.name)}">
                <span class="companion-row__name">${L(e.name)}</span>
                ${s}
                <span style="flex:1;"></span>
                ${c}
                ${l}
            </div>
        `},c=()=>{let e=t.companions||[];return e.length===0?`<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-6); margin: 0;">
                No companions on this trip yet. Add a friend or type a name below.
            </p>`:e.map(s).join(``)},{root:l,close:u}=O({variant:`glass-light`,cardStyle:`width: 520px; max-height: 80vh; display: flex; flex-direction: column;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">Trip Companions</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                Add who's coming on <strong>${L(t.name)}</strong>. Friends get a trip invitation (Relaxer by default — you can override per pick); plain companions are just labels for non-app travellers.
            </p>

            <div id="companionPickerList" style="display: flex; flex-direction: column; gap: var(--space-2); overflow-y: auto; padding: var(--space-1); margin-bottom: var(--space-4); flex: 1; min-height: 0;">
                ${c()}
            </div>

            <!-- Add affordances: friend picker + inline plain-name input.
                 Both write to trip.companions immediately and re-render the
                 list, so what the user sees IS the saved state. -->
            <div class="companion-picker-add-section">
                <button type="button" id="companionPickerAddFriendBtn" class="companion-picker-add-section__friend-btn">
                    <span style="font-size: 1rem;">👤</span>
                    <span>Add a friend</span>
                </button>
                <form id="companionPickerAddForm" class="companion-picker-add-form" style="margin-bottom: 0;">
                    <input type="text" id="companionPickerAddInput" class="companion-picker-add-form__input" placeholder="+ Add unlinked companion" autocomplete="off">
                    <button type="submit" class="companion-picker-add-form__btn">Add</button>
                </form>
            </div>

            <!-- Friend picker (hidden by default) — appears when "Add a
                 friend" is clicked, listing accepted friends not already
                 on this trip. Pick one + role → adds to trip + invites. -->
            <div id="companionPickerFriendSheet" class="companion-picker-friend-sheet" hidden>
                <div class="companion-picker-friend-sheet__header">
                    <strong>Add a friend</strong>
                    <button type="button" id="companionPickerFriendCancel" class="btn-x-bare" title="Close">✕</button>
                </div>
                <div id="companionPickerFriendList" class="companion-picker-friend-sheet__list">
                    <p style="text-align:center; color: rgba(0,0,0,0.45); padding: var(--space-4); margin: 0;">Loading friends…</p>
                </div>
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="companionPickerCloseBtn" class="btn-primary" style="flex: 1; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">Done</button>
            </div>
        `}),d=I(l,`#companionPickerList`),f=I(l,`#companionPickerFriendSheet`),p=I(l,`#companionPickerFriendList`),m=I(l,`#companionPickerAddInput`),h=()=>{d.innerHTML=c()},_=()=>{let e=new Set((t.companions||[]).map(e=>e.linkedUserId).filter(Boolean)),r=a.filter(t=>t.id!==n&&!e.has(t.id));if(r.length===0){p.innerHTML=`<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-4); margin: 0;">
                No friends available — every accepted friend is already on this trip, or your friends list is empty.
            </p>`;return}p.innerHTML=r.map(e=>`
            <div class="companion-row friend-pick-row picker-friend-row" data-friend-id="${L(e.id)}" data-friend-name="${L(e.name)}">
                <img src="${L(e.picture)}" alt="" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;">
                <span class="companion-row__name">${L(e.name)}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${L(e.email)}</span>
                <select class="companion-row__role-select picker-friend-role-select">
                    <option value="${ge}" selected>Relaxer</option>
                    <option value="${he}">Budgeteer</option>
                    <option value="${z}">Planner</option>
                </select>
                <button type="button" class="btn-link-action picker-friend-add-btn">+ Add</button>
            </div>
        `).join(``)};I(l,`#companionPickerCloseBtn`).onclick=()=>u(),I(l,`#companionPickerFriendCancel`).onclick=()=>{f.hidden=!0},I(l,`#companionPickerAddFriendBtn`).onclick=async()=>{f.hidden=!1,a.length===0&&(a=await qt()),_()},I(l,`#companionPickerAddForm`).onsubmit=e=>{e.preventDefault();let n=m.value.trim();if(n){if(g(t,n)){m.value=``,m.focus();return}v(t,n),T(`state:changed`),Q(t),m.value=``,h()}},l.addEventListener(`click`,async e=>{let n=e.target;if(!n)return;let r=n.closest(`.picker-remove-btn`);if(r?.dataset.name){let e=r.dataset.name,n=g(t,e);if(!n)return;y(t,e),T(`state:changed`),Q(t),n.linkedUserId&&await Wt(t.id,n.linkedUserId),h();return}let i=n.closest(`.picker-link-btn`);if(i?.dataset.name){f.hidden=!1,f.dataset.linkTargetName=i.dataset.name,a.length===0&&(a=await qt()),_();return}let s=n.closest(`.picker-friend-add-btn`);if(s){let e=s.closest(`.picker-friend-row`);if(!e?.dataset.friendId)return;let n=e.dataset.friendId,r=e.dataset.friendName||`Friend`,i=e.querySelector(`.picker-friend-role-select`)?.value||`relaxer`,a=f.dataset.linkTargetName;if(a){let e=g(t,a);e&&(e.linkedUserId=n),delete f.dataset.linkTargetName}else{let e=g(t,r);e&&!e.linkedUserId?e.linkedUserId=n:v(t,r,n)}T(`state:changed`),Q(t),await Ht(t.id,n,i),f.hidden=!0,h(),N(`${r} invited as ${o(i)}`)}})},ke=e=>{let t=b.trips.find(t=>t.id===e);if(!t)return;let n=t.members||[],r=n.find(e=>e.userId===t.ownerId),i=n.filter(e=>e.userId!==t.ownerId),a=e=>e===`planner`?`Planner`:e===`budgeteer`?`Budgeteer`:e===`relaxer`?`Relaxer`:e,o=(e,t)=>`
        <div class="companion-row" style="cursor: default;">
            ${e.picture?`<img src="${L(e.picture)}" alt="" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;">`:``}
            <span class="companion-row__name">${L(e.name||e.userId)}</span>
            <span class="companion-link-pill ${t?`companion-link-pill--linked`:`companion-link-pill--pending`}">
                ${t?`👑 Owner`:L(a(e.role))}
            </span>
        </div>
    `,{root:s,close:c}=O({variant:`glass-light`,cardStyle:`width: 460px; max-height: 80vh; display: flex; flex-direction: column;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">Trip members</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                You're on <strong>${L(t.name)}</strong> as a <strong>${L(a(t.myRole||`relaxer`))}</strong>. Roster is managed by the trip owner.
            </p>

            <div style="display: flex; flex-direction: column; gap: var(--space-2); overflow-y: auto; padding: var(--space-1); margin-bottom: var(--space-5); flex: 1; min-height: 0;">
                ${r?o(r,!0):``}
                ${i.map(e=>o(e,!1)).join(``)}
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="tripMembersCloseBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">Close</button>
            </div>
        `});I(s,`#tripMembersCloseBtn`).onclick=()=>c()},Ae=e=>{let t=e.related_id?String(e.related_id):``;if(!t)return;let n=(e.message||``).match(/invited you to (.+?) as a (\w+)/i),r=n?n[1]:`a trip`,i=n?n[2]:`member`,{root:a,close:o}=O({variant:`glass-light`,cardStyle:`width: 440px;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">Trip invitation</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.6); line-height: 1.5;">
                ${L(e.message||`You've been invited to ${r} as a ${i}.`)}
            </p>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-sm); color: rgba(0,0,0,0.5);">
                Accept and the trip appears in your active list. Planners can edit; Relaxers can only watch.
            </p>

            <div style="display: flex; gap: var(--space-3);">
                <button id="tripInviteAcceptBtn" class="btn-primary" style="flex: 2; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">Accept</button>
                <button id="tripInviteDeclineBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">Decline</button>
            </div>
        `});I(a,`#tripInviteAcceptBtn`).onclick=async()=>{let e=await Ut(t,!0);if(!e||!e.ok){N(`This trip invitation is no longer valid`),o();return}o(),await Lt(),b.trips.find(e=>e.id===t)&&(b.activeTripId=t,T(`state:changed`)),N(`Joined the trip`),q(`home`)},I(a,`#tripInviteDeclineBtn`).onclick=async()=>{let e=await Ut(t,!1);!e||!e.ok?N(`This invitation is no longer active`):N(`Declined`),o()}};function je(e){e.addEventListener(`keydown`,e=>{if(e.key!==`Enter`&&e.key!==` `)return;let t=e.target;if(!t)return;let n=t.closest(`[role="button"]`);n&&(t.matches(`input, button, select, textarea, a`)||(e.preventDefault(),n.click()))})}function Me(e){return Array.isArray(e?.markedPlaces)?e.markedPlaces:[]}function Ne(e,t){if(t)return Me(e).find(e=>e.placeId===t)}function Pe(e,t,n,r){if(!e||!t?.place_id)return;Array.isArray(e.markedPlaces)||(e.markedPlaces=[]);let i=e.markedPlaces.find(e=>e.placeId===t.place_id);if(i){i[n]=!i[n],!i.forAI&&!i.forManual&&(e.markedPlaces=e.markedPlaces.filter(e=>e.placeId!==t.place_id));return}let a={placeId:t.place_id,name:t.name||``,address:t.vicinity||t.formatted_address||``,lat:t.geometry?.location?.lat?.()??t.geometry?.location?.lat??0,lng:t.geometry?.location?.lng?.()??t.geometry?.location?.lng??0,icon:r?.icon||`📍`,color:r?.color||`#0071e3`,forAI:n===`forAI`,forManual:n===`forManual`,dayId:null,timeOfDay:null};e.markedPlaces.push(a)}function Fe(e,t){!e||!Array.isArray(e.markedPlaces)||(e.markedPlaces=e.markedPlaces.filter(e=>e.placeId!==t))}function Ie(e,t,n,r){if(!e||!Array.isArray(e.markedPlaces))return;let i=e.markedPlaces.find(e=>e.placeId===t);i&&(i.dayId=n||null,i.timeOfDay=r||null)}var Le=null;function Re(){Le&&=(clearInterval(Le),null)}var ze={},B=null,V=null,H=null,U=`days`,Be=[{key:`restaurants`,placesType:`restaurant`,searchStrategy:`distance`,icon:`🍽️`,label:`Restaurants`,color:`#ff9500`,defaultMinRating:4,tooltip:`Closest restaurants (≤60) to the search center — defaults to 4★+, tweak in Settings → General`},{key:`supermarkets`,placesType:`supermarket`,searchStrategy:`distance`,icon:`🛒`,label:`Supermarkets`,color:`#34c759`,defaultMinRating:0,tooltip:`Closest supermarkets and grocery stores`},{key:`hotels`,placesType:`lodging`,searchStrategy:`distance`,icon:`🛏️`,label:`Hotels`,color:`#5856d6`,defaultMinRating:4,tooltip:`Closest hotels and lodging — defaults to 4★+`},{key:`sights`,placesType:`tourist_attraction`,searchStrategy:`wide`,icon:`🏖️`,label:`Sights`,color:`#a460ed`,defaultMinRating:0,tooltip:`Tourist attractions across the wider trip area (50 km)`},{key:`parks`,placesType:`park`,searchStrategy:`wide`,icon:`🌳`,label:`Parks`,color:`#1a6b3c`,defaultMinRating:0,tooltip:`Parks and gardens across the wider trip area`},{key:`worship`,placesType:`church`,searchStrategy:`wide`,icon:`⛪`,label:`Worship`,color:`#a460ed`,defaultMinRating:0,tooltip:`Churches and places of worship across the wider trip area`},{key:`medical`,placesType:`hospital`,searchStrategy:`wide`,useGenesisAlways:!0,icon:`🏥`,label:`Medical`,color:`#ff3b30`,defaultMinRating:0,tooltip:`Hospitals, doctors, pharmacies, clinics. Vets are excluded — they live on the Pets pill.`},{key:`pets`,placesType:`veterinary_care`,extraPlacesTypes:[`pet_store`],searchStrategy:`wide`,useGenesisAlways:!0,icon:`🐾`,label:`Pets`,color:`#a460ed`,defaultMinRating:0,tooltip:`Vets and pet stores across the wider trip area`},{key:`schools`,placesType:`school`,searchStrategy:`wide`,useGenesisAlways:!0,icon:`🎓`,label:`Schools`,color:`#0071e3`,defaultMinRating:0,tooltip:`Schools and universities. Always searches the wider trip area.`},{key:`sports`,placesType:`stadium`,searchStrategy:`wide`,useGenesisAlways:!0,icon:`🏟️`,label:`Sports`,color:`#ff2d55`,defaultMinRating:0,tooltip:`Stadiums and gyms. Always searches the wider trip area — they're landmarks, you want them all.`},{key:`govt`,placesType:`city_hall`,searchStrategy:`wide`,useGenesisAlways:!0,icon:`🏛️`,label:`Govt`,color:`#8e8e93`,defaultMinRating:0,tooltip:`Government buildings + embassies. Always searches the wider trip area — sparse and useful to know where they are across the whole trip.`},{key:`transit`,placesType:`transit_station`,searchStrategy:`wide`,useGenesisAlways:!0,icon:`🚆`,label:`Public transit`,color:`#0a3d6b`,defaultMinRating:0,tooltip:`Big stations only — train, metro, light rail. Always searches the wider trip area (50 km from the genesis pin), even if you've picked a specific day as the search center. Bus stops are filtered out.`},{key:`traffic`,placesType:null,searchStrategy:`wide`,icon:`🛣️`,label:`Roads & traffic`,color:`#0a3d6b`,defaultMinRating:0,tooltip:`Highway / arterial road names + live Google traffic congestion`}];function Ve(e,t){if(!Array.isArray(t)||t.length===0)return!0;let n=e=>e===`restaurant`||e.endsWith(`_restaurant`)||e===`cafe`||e===`bar`||e===`meal_takeaway`||e===`meal_delivery`,r=e=>e===`lodging`||e.endsWith(`_hotel`)||e===`motel`||e===`hostel`||e===`bed_and_breakfast`||e===`guest_house`||e===`inn`||e===`resort_hotel`||e===`extended_stay_hotel`,i=e=>e===`supermarket`||e===`grocery_or_supermarket`,a=e=>e===`train_station`||e===`subway_station`||e===`light_rail_station`,o=e=>e===`hospital`||e===`doctor`||e===`pharmacy`||e===`dentist`||e===`physiotherapist`||e===`health`||e===`medical_lab`,s=e=>e===`veterinary_care`||e===`pet_store`,c={restaurants:{match:n,conflict:r},hotels:{match:r,conflict:n},supermarkets:{match:i,conflict:()=>!1},transit:{match:a,conflict:()=>!1},medical:{match:o,conflict:s},pets:{match:s,conflict:o}}[e];if(!c)return!0;let l=-1,u=-1;for(let e=0;e<t.length&&(l<0&&c.match(t[e])&&(l=e),u<0&&c.conflict(t[e])&&(u=e),!(l>=0&&u>=0));e++);return l<0?!1:u<0?!0:l<u}var He=e=>{H=H===e?null:e,q(`home`,null,!0)},Ue=e=>{let t=b.tripDays.find(t=>t.id===e);t&&(B=e,N(`Click on the map to set the location for this day!`),V=e=>{t.lat=e.latlng.lat,t.lon=e.latlng.lng,t.lng=e.latlng.lng,V=null,q(`home`,null,!0)},q(`home`,null,!0))},We=e=>{B=e,q(`home`,null,!0)},Ge=async e=>{let t=b.tripDays.find(t=>t.id===e);t&&(B=null,V=null,T(`state:changed`),await $(t),N(`Location saved!`),q(`home`,null,!0))},Ke=async e=>{let t=b.tripDays.find(t=>t.id===e);t&&(t.lat=null,t.lon=null,t.lng=null,B=null,V=null,T(`state:changed`),await $(t),q(`home`,null,!0))},qe=e=>{let t=b.tripDays.find(t=>t.id===e);if(t){if(Number(t.dayNumber)===0){N(`Trip Genesis can't be deleted — it anchors the trip.`);return}P({title:`Delete Day ${t.dayNumber}?`,message:`This removes the day and all its journaling, photos, and documents. This can't be undone.`,confirmText:`Delete Day`,onConfirm:async()=>{let n=t.tripId;b.tripDays=b.tripDays.filter(t=>t.id!==e),b.tripDays.filter(e=>e.tripId===n&&Number(e.dayNumber)>0).sort((e,t)=>e.dayNumber-t.dayNumber).forEach((e,t)=>{e.dayNumber=t+1}),H===e&&(H=null),B===e&&(B=null,V=null),T(`state:changed`),await Zt(e),await Promise.all(b.tripDays.filter(e=>e.tripId===n).map(e=>$(e))),N(`Day deleted`),q(`home`,null,!0)}})}};function Je(){let e=document.createElement(`div`),t=b.trips&&b.activeTripId?b.trips.find(e=>e.id===b.activeTripId):null,n=0,r=[],a=[],o=()=>{};if(t){let e=localStorage.getItem(`home_media_toggle`)!==`fact`;localStorage.setItem(`home_media_toggle`,e?`fact`:`quote`);let i=new Set;t.countryCode&&i.add(t.countryCode);let s=(b.tripDays||[]).filter(e=>e.tripId===t.id);for(let e of s){let t=e.lat,n=e.lon||e.lng;if(!(typeof t!=`number`||typeof n!=`number`))try{let e=sessionStorage.getItem(`tggDayCountry:${t.toFixed(4)},${n.toFixed(4)}`);e&&i.add(e)}catch{}}(()=>{let o=ce(t,[...i]),s=e?o.quotes:o.facts,c=s.length>0?Math.floor(Math.random()*s.length):0;a=[s[c]||``],r=o.images.length>c?[o.images[c]]:o.images[0]?[o.images[0]]:[],n>=r.length&&(n=0)})(),o=e=>{if(!e)return;let t=e.toUpperCase();i.add(t)}}else{r=i.map(e=>e.i),a=i.map(e=>e.q);let e=Array.from({length:r.length},(e,t)=>t);e.sort(()=>Math.random()-.5),r=e.map(e=>r[e]),a=e.map(e=>a[e])}let s=()=>{if(r.length<=1)return;n=(n+1)%r.length;let t=e.querySelector(`#homeHeroImg`),i=e.querySelector(`#homeQuote`);t&&(t.style.opacity=`0`,setTimeout(()=>{t.src=r[n],t.style.opacity=`1`},800)),i&&(i.style.opacity=`0`,setTimeout(()=>{i.innerText=a[n%a.length]||``,i.style.opacity=`1`},800))};if(!t)e.innerHTML=`
            <div class="ai-page-header" style="padding: 40px; text-align: center; border-radius: 28px;">
                <h1 style="display: inline-block; background: linear-gradient(135deg, var(--accent-blue), #9b59b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin: 0; font-size: 3.5rem;">Let's travel.</h1>
                <p style="color: var(--text-secondary); max-width: 440px; margin: 10px auto 0; font-size: 1.1rem;">Your next big adventure is waiting. Create a trip to start tracking expenses and planning days.</p>
            </div>
            
            <div class="card glass cover-card cover-card--lg">
                <img id="homeHeroImg" src="${r[0]||``}" alt="" style="width: 100%; height: 100%; object-fit: cover; transition: opacity 0.8s ease-in-out;">
                <div class="cover-card__gradient"></div>
                <div class="cover-card__content" style="display: flex; align-items: flex-end; justify-content: space-between;">
                    <p id="homeQuote" class="cover-card__quote" style="max-width: 60%;">
                        ${a[0]||``}
                    </p>
                    <button class="btn" id="homeCreateFirstTripBtn" style="background: var(--accent-blue); padding: 12px 24px; border-radius: 100px; box-shadow: 0 10px 20px rgba(0,113,227,0.3); font-weight: 700; font-size: 0.95rem;">Create Trips</button>
                </div>
            </div>
        `,Re(),Le=setInterval(s,6e3),e.querySelector(`#homeCreateFirstTripBtn`)?.addEventListener(`click`,()=>Te());else{let n=(b.expenses||[]).filter(e=>e&&e.tripId===t.id),r=(b.tripDays||[]).filter(e=>e.tripId===t.id),i=n.length===0&&r.length===0,s=`Welcome back, traveler`;if(i&&t.country){let e=ae(t.country.includes(` - `)?t.country.split(` - `)[1]:t.country),n=[`Welcome back, ${b.user&&b.user.firstName?b.user.firstName:`traveler`}!`,`Ready for your ${t.name} adventure?`,`Your ${e} adventure starts here.`,`Time to write your ${e} story.`];s=n[Math.floor(Math.random()*n.length)]}e.innerHTML=`
            <div class="ai-page-header" style="text-align: center;">
                <h1 style="display: inline-block; background: linear-gradient(135deg, var(--accent-blue), #9b59b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${s}</h1>
                ${t?`<p>You have <strong>${n.length}</strong> expenses recorded for ${t.name}.</p>`:`<p>Welcome! Start by creating your first trip.</p>`}
            </div>
            
            <div class="card glass cover-card cover-card--md">
                <div id="homeHeroMap" style="width: 100%; height: 100%; position: absolute; inset: 0; z-index: 0;"></div>
                <div class="cover-card__gradient" style="pointer-events: none; z-index: 1;"></div>
                <div class="cover-card__content" style="pointer-events: none; z-index: 2;">
                    <p id="homeQuote" class="cover-card__quote">
                        ${a[0]||``}
                    </p>
                </div>
            </div>

            <!-- POI filter pills — sit BELOW the map so they don't cover
                 anything. Each pill renders with its label by default
                 since the row fits on a single line at typical viewport
                 widths. Pills the user has hidden in Settings → General
                 (poiVisible[key] === false) are filtered out here. -->
            <div id="homeMapPoiToggles" class="map-poi-toggles map-poi-toggles--below">
                ${Be.filter(e=>b.preferences?.poiVisible?.[e.key]!==!1).map(e=>`
                        <button type="button" class="map-poi-toggle" data-poi="${e.key}" aria-pressed="false" title="${L(e.tooltip)}">${e.icon} <span>${L(e.label)}</span></button>
                    `).join(``)}
            </div>
        `,Re(),setTimeout(()=>{let e=document.getElementById(`homeHeroMap`);if(e&&typeof google<`u`&&google.maps&&t){let n=t.country||``,r=n.includes(` - `)?n.split(` - `)[1]+`, USA`:n,i=t?t.id:null,a=i&&b.mapViews&&b.mapViews[i],s=[{featureType:`poi`,stylers:[{visibility:`off`}]},{featureType:`transit`,stylers:[{visibility:`off`}]},{featureType:`road`,elementType:`labels`,stylers:[{visibility:`off`}]}],c=e=>{let t=s.slice();return e.has(`traffic`)&&t.push({featureType:`road.highway`,elementType:`labels`,stylers:[{visibility:`on`}]},{featureType:`road.highway`,elementType:`labels.text.fill`,stylers:[{color:`#0a3d6b`},{weight:2}]},{featureType:`road.highway`,elementType:`labels.text.stroke`,stylers:[{color:`#ffffff`},{weight:4}]},{featureType:`road.arterial`,elementType:`labels`,stylers:[{visibility:`on`}]}),t},l=null,u=()=>l||(typeof google>`u`||!google.maps||!google.maps.places?null:(l=new google.maps.places.PlacesService(k),l)),d={},f={},p={},m=null,h=()=>m||(m=new google.maps.InfoWindow,m),g=ye(t),_=(e,n)=>{let r=L(n.name||e.label),i=L(n.vicinity||``),a=typeof n.rating==`number`?`<div style="margin-top: 6px; font-size: 13px; color: #444;"><span style="color: #ff9500;">★</span> ${n.rating.toFixed(1)}${n.user_ratings_total?` <span style="color: #888;">(${n.user_ratings_total})</span>`:``}</div>`:``,o=n.place_id?`https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(n.place_id)}`:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(n.name||``)}`,s=Ne(t,n.place_id),c=!!s?.forAI,l=!!s?.forManual,u=g&&n.place_id?`
                        <div style="display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap;">
                            <button type="button" data-action="mark-ai" data-place-id="${L(n.place_id)}"
                                style="flex: 1; min-width: 120px; padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; border: 1.5px solid #5856d6; background: ${c?`#5856d6`:`white`}; color: ${c?`white`:`#5856d6`};">
                                ${c?`✓ Marked for AI`:`🤖 Mark for AI`}
                            </button>
                            <button type="button" data-action="mark-manual" data-place-id="${L(n.place_id)}"
                                style="flex: 1; min-width: 120px; padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; border: 1.5px solid #ff9500; background: ${l?`#ff9500`:`white`}; color: ${l?`white`:`#ff9500`};">
                                ${l?`✓ Shortlisted`:`📝 Shortlist it`}
                            </button>
                        </div>
                    `:``;return`
                        <div style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif; min-width: 240px; max-width: 280px; padding: 4px 2px;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                <span style="font-size: 18px;">${e.icon}</span>
                                <strong style="font-size: 15px; color: #002d5b; line-height: 1.25;">${r}</strong>
                            </div>
                            ${i?`<div style="font-size: 12px; color: #666; line-height: 1.4;">${i}</div>`:``}
                            ${a}
                            <a href="${o}" target="_blank" rel="noopener" style="display: inline-block; margin-top: 10px; padding: 6px 12px; background: ${e.color}; color: white; text-decoration: none; border-radius: 8px; font-size: 12px; font-weight: 700;">View on Google Maps →</a>
                            ${u}
                        </div>
                    `},v=(e,n)=>{let r=h();r&&r.getContent&&r.getContent();let i=document.querySelector(`.gm-style-iw [data-action="mark-ai"][data-place-id="${n.place_id}"]`);if(!i)return;let a=i,o=document.querySelector(`.gm-style-iw [data-action="mark-manual"][data-place-id="${n.place_id}"]`),s=()=>{r.setContent(_(e,n)),google.maps.event.addListenerOnce(r,`domready`,()=>{v(e,n)})};a.onclick=()=>{Pe(t,n,`forAI`,e),T(`state:changed`),Q(t),s()},o&&(o.onclick=()=>{Pe(t,n,`forManual`,e),T(`state:changed`),Q(t),s()})},y=(e,t)=>{let n=t.geometry?.location;if(!n)return null;let r=`data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.35"/></filter></defs><circle cx="22" cy="22" r="18" fill="white" stroke="${encodeURIComponent(e.color)}" stroke-width="3.5" filter="url(%23s)"/><text x="22" y="29" text-anchor="middle" font-size="20">${e.icon}</text></svg>`,i=new google.maps.Marker({map:k,position:n,title:t.name||e.label,icon:{url:r,scaledSize:new google.maps.Size(40,40),anchor:new google.maps.Point(20,20)},zIndex:1});return i.addListener(`click`,()=>{let r=h();r.setContent(_(e,t)),google.maps.event.addListenerOnce(r,`domready`,()=>{v(e,t)}),r.open({map:k,anchor:i}),k.panTo(n),k.getZoom()<17&&k.setZoom(17)}),i},x=(e=!1)=>{let n=t?.id||``;if(!e){let e=b.preferences?.pillEpicenters?.[n];if(e){let t=M.find(t=>t.id===e&&t.lat);if(t)return{center:{lat:t.lat,lng:t.lng||t.lon},anchorId:t.id}}}let r=M.find(e=>e.dayNumber===0&&e.lat);return r?{center:{lat:r.lat,lng:r.lng||r.lon},anchorId:`genesis`}:t?.lat?{center:{lat:t.lat,lng:t.lng},anchorId:`trip`}:{center:null,anchorId:``}},S=e=>{let t=b.preferences?.poiAnchoring?.[e.key];return t===`genesis`?!0:t===`epicenter`?!1:!!e.useGenesisAlways},C=e=>{let n=t?.id||``,{center:r,anchorId:i}=x(S(e)),a=`${n}|${e.key}|${i}|${e.searchStrategy}`;if(f[a])return Promise.resolve(f[a]);if(p[a])return p[a];let o=new Promise(t=>{if(!r||typeof r.lat!=`number`||typeof r.lng!=`number`){t([]);return}let n=u();if(!n){t([]);return}let i=[],a=[e.placesType,...e.extraPlacesTypes||[]],o=a.length,s=(e,n,r)=>{(n===google.maps.places.PlacesServiceStatus.OK||n===google.maps.places.PlacesServiceStatus.ZERO_RESULTS)&&Array.isArray(e)&&i.push(...e),r&&r.hasNextPage&&i.length<60?setTimeout(()=>r.nextPage(),200):--o===0&&t(i)};a.forEach(t=>{e.searchStrategy===`distance`?n.nearbySearch({location:r,rankBy:google.maps.places.RankBy.DISTANCE,type:t},s):n.nearbySearch({location:r,radius:5e4,type:t},s)})});return p[a]=o,o.then(e=>{f[a]=e,delete p[a]}),o},w=async(e,t)=>{let n=Be.find(t=>t.key===e);if(!n||!n.placesType||((d[e]||[]).forEach(e=>e.setMap(null)),d[e]=[],!t))return;let r=await C(n);if(!O.has(e))return;let i=b.preferences?.poiFilters?.[e]||{},a=typeof i.minRating==`number`?i.minRating:n.defaultMinRating,o=[],s=new Set;r.forEach(e=>{let t=e.place_id;if(t&&s.has(t)||(t&&s.add(t),!Ve(n.key,e.types))||(typeof e.rating==`number`?e.rating:0)<a)return;let r=y(n,e);r&&o.push(r)}),d[e]=o},E=t?.id||``,D=(b.preferences?.enabledPois?.[E]||[]).filter(e=>Be.some(t=>t.key===e)),O=new Set(D),ee={center:a?{lat:a.lat,lng:a.lng}:{lat:20,lng:0},zoom:a?a.zoom:2,minZoom:2,mapTypeId:`hybrid`,disableDefaultUI:!0,keyboardShortcuts:!1,gestureHandling:`greedy`,backgroundColor:`#ffffff`,styles:c(O),restriction:{latLngBounds:{north:85,south:-85,west:-180,east:180},strictBounds:!0}},k=new google.maps.Map(e,ee);window.activeMap=k;let A=null,j=e=>{e?(A||=new google.maps.TrafficLayer,A.setMap(k)):A&&A.setMap(null)},te=()=>{if(!b.preferences)return;b.preferences.enabledPois||(b.preferences.enabledPois={});let e=t?.id||``;e&&(b.preferences.enabledPois[e]=Be.filter(e=>O.has(e.key)).map(e=>e.key),T(`state:changed`))},ne=document.getElementById(`homeMapPoiToggles`);ne&&ne.addEventListener(`click`,e=>{let t=e.target?.closest(`.map-poi-toggle`);if(!t)return;let n=t.dataset.poi;if(!n)return;let r=!O.has(n);r?O.add(n):O.delete(n),k.setOptions({styles:c(O)}),n===`traffic`&&j(r),w(n,r),t.classList.toggle(`is-on`,r),t.setAttribute(`aria-pressed`,String(r)),te()}),O.size>0&&(k.setOptions({styles:c(O)}),O.has(`traffic`)&&j(!0),O.forEach(e=>{let t=ne?.querySelector(`.map-poi-toggle[data-poi="${e}"]`);t&&(t.classList.add(`is-on`),t.setAttribute(`aria-pressed`,`true`)),w(e,!0)}));let M=t?(b.tripDays||[]).filter(e=>e.tripId===t.id):[];ze={},M.forEach(e=>{if(e.lat&&(e.lon||e.lng)){let t=e.lon||e.lng,n=B===e.id,r=e.dayNumber===0,i=new google.maps.Marker({position:{lat:e.lat,lng:t},map:k,draggable:n,title:r?`Trip Genesis`:`Day ${e.dayNumber}: ${e.name}`,label:r?void 0:{text:String(e.dayNumber),color:`white`,fontWeight:`800`,fontSize:n?`16px`:`14px`},icon:r?{url:`data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="%2334c759" stroke="white" stroke-width="3"/><path d="M 24,11 L 27.06,18.96 L 35.55,19.49 L 28.92,24.92 L 31.0,33.16 L 24,28.6 L 17,33.16 L 19.08,24.92 L 12.45,19.49 L 20.94,18.96 Z" fill="white"/></svg>`,scaledSize:new google.maps.Size(48,48),anchor:new google.maps.Point(24,24)}:{path:google.maps.SymbolPath.CIRCLE,fillOpacity:1,fillColor:n?`#ff3b30`:`#007aff`,strokeColor:`white`,strokeWeight:3,scale:n?22:18},zIndex:r?1:100});ze[e.id]=i,n?i.addListener(`dragend`,()=>{let t=i.getPosition();e.lat=t.lat(),e.lon=t.lng(),e.lng=t.lng()}):i.addListener(`click`,()=>{k.panTo(i.getPosition()),k.setZoom(12)})}}),V&&(k.addListener(`click`,e=>V({latlng:{lat:e.latLng.lat(),lng:e.latLng.lng()}})),e.style.cursor=`crosshair`),k.addListener(`idle`,()=>{if(!i)return;b.mapViews||={};let e=k.getCenter();b.mapViews[i]={lat:e.lat(),lng:e.lng(),zoom:k.getZoom()},T(`state:changed`)});let re=r.trim();if(!a)if(t.viewport){let e=t.viewport,n=new google.maps.LatLngBounds({lat:e.south,lng:e.west},{lat:e.north,lng:e.east});google.maps.event.addListenerOnce(k,`tilesloaded`,()=>{k.fitBounds(n)})}else new google.maps.Geocoder().geocode({address:re},(e,n)=>{if(n===`OK`&&e[0]){let n=e[0].geometry.viewport;google.maps.event.addListenerOnce(k,`tilesloaded`,()=>{k.fitBounds(n)});let r=n.getSouthWest(),i=n.getNorthEast(),a=e[0].geometry.location;t.lat=a.lat(),t.lng=a.lng(),t.viewport={south:r.lat(),west:r.lng(),north:i.lat(),east:i.lng()},Q(t)}});if(M.some(e=>typeof e.lat==`number`)){let e=google,t=`tggDayCountry:`,n=async(n,r)=>{let i=`${n.toFixed(4)},${r.toFixed(4)}`;try{let e=sessionStorage.getItem(t+i);if(e)return e}catch{}try{let a=await new e.maps.Geocoder().geocode({location:{lat:n,lng:r}}),o=a&&a.results||[];for(let e of o){let n=(e.address_components||[]).find(e=>(e.types||[]).includes(`country`));if(n&&n.short_name){let e=n.short_name.toUpperCase();try{sessionStorage.setItem(t+i,e)}catch{}return e}}}catch{}return``};(async()=>{for(let e of M){let t=e.lat,r=e.lon||e.lng;if(typeof t!=`number`||typeof r!=`number`)continue;let i=await n(t,r);i&&o(i)}})()}}},100)}let c=t?(b.expenses||[]).filter(e=>e&&e.tripId===t.id):[],l=t?(b.tripDays||[]).filter(e=>e.tripId===t.id):[],u=document.createElement(`div`);u.style.marginTop=`40px`,b.guideProgress||={};let d=!!b.user||window.isGoogleAuthenticated===!0,f=b.trips.length>0,p=b.trips.some(e=>(e.companions||[]).length>0),m=l.length>0,h=c.length>0,g=b.budgets&&b.budgets.length>0,v=b.archivedTrips&&b.archivedTrips.length>0,y=(b.categories||[]).length>3,x=b.expenses.some(e=>e.isSettlement);d&&(b.guideProgress.login=!0),f&&(b.guideProgress.trip=!0),p&&(b.guideProgress.companions=!0),m&&(b.guideProgress.plan=!0),h&&(b.guideProgress.expenses=!0),g&&(b.guideProgress.budgets=!0),v&&(b.guideProgress.collections=!0),y&&(b.guideProgress.categories=!0),x&&(b.guideProgress.settlement=!0);let S=[{text:`Log in to your account`,done:b.guideProgress.login,icon:`🔐`,action:()=>q(`profile`)},{text:`Create your first trip`,done:b.guideProgress.trip,icon:`✈️`,action:()=>Te()},{text:`Add your travel companions`,done:b.guideProgress.companions,icon:`👥`,action:()=>{t?Oe(t.id):q(`home`)}},{text:`Set your own categories`,done:b.guideProgress.categories,icon:`🏷️`,action:()=>{q(`personalization`),setTimeout(()=>R(`categories`),50)}},{text:`Generate your AI travel plan<br><span style="font-size: 0.85rem; opacity: 0.8; font-weight: 500;">(or <span data-guide-action="open-add-day" class="link-underline">create it manually</span>)</span>`,done:b.guideProgress.plan,icon:`✦`,action:()=>q(`ai`)},{text:`Input your expenses<br><span style="font-size: 0.85rem; opacity: 0.8; font-weight: 500;">(<span data-guide-action="navigate-expenses" class="link-underline">Manually</span> or <span data-guide-action="navigate-upload" class="link-underline">in a batch</span>)</span>`,done:b.guideProgress.expenses,icon:`💰`,action:()=>q(`expenses`)},{text:`Explore Budgets`,done:b.guideProgress.budgets,icon:`📊`,action:()=>q(`budgets`)},{text:`Settle your first expenses`,done:b.guideProgress.settlement,icon:`🤝`,action:()=>q(`settlement`)},{text:`Discover Collections`,done:b.guideProgress.collections,icon:`📂`,action:()=>q(`collections`)},{text:`Connect with your friends`,done:b.guideProgress.friends,icon:`📱`,action:()=>q(`friends`)}],C=S.every(e=>e.done)||b.guideAllDone;C&&!b.guideAllDone&&(b.guideAllDone=!0,T(`state:changed`));let w=document.createElement(`div`);if(w.style.marginTop=`40px`,t){let e=l.filter(e=>Number(e.dayNumber)===0);if(e.length>1){for(let t of e.slice(1))b.tripDays=b.tripDays.filter(e=>e.id!==t.id),Zt(t.id);l.length=0,l.push(...b.tripDays.filter(e=>e.tripId===t.id))}let n=`tggDay0Created:${t.id}`,r=(()=>{try{return sessionStorage.getItem(n)===`1`}catch{return!1}})(),i=l.some(e=>Number(e.dayNumber)===0);if(i&&!r)try{sessionStorage.setItem(n,`1`)}catch{}if(!i&&!r&&typeof t.lat==`number`&&typeof t.lng==`number`){let e={id:F(),tripId:t.id,name:`Trip Genesis`,date:``,dayNumber:0,lat:t.lat,lng:t.lng,photos:[],notes:``,plan:{morning:``,afternoon:``,evening:``},tickets:[],documents:[]};b.tripDays.push(e),l.push(e);try{sessionStorage.setItem(n,`1`)}catch{}$(e),T(`state:changed`)}}l.sort((e,t)=>e.dayNumber-t.dayNumber);let E=t&&t.name?t.name:`Your Journey`,D=xe(t),O=ye(t),ee=(()=>{if(!t)return``;let e=t.members||[],n=t.companions||[],r=[],i=new Set,a=e.find(e=>e.userId===t.ownerId);a&&(r.push({name:_(t,a.userId)?.name||a.name||`Owner`,role:a.role,picture:a.picture,isOwner:!0,isMember:!0}),i.add(a.userId));for(let n of e)i.has(n.userId)||(i.add(n.userId),r.push({name:_(t,n.userId)?.name||n.name||n.userId,role:n.role,picture:n.picture,isOwner:!1,isMember:!0}));for(let e of n)e.linkedUserId&&i.has(e.linkedUserId)||r.push({name:e.name,role:null,isOwner:!1,isMember:!1,isPending:!!e.linkedUserId});return r.length===0?``:`<div id="tripMembersPanel" class="trip-members-panel" title="${D?`Manage trip companions`:`See who's on this trip`}">${r.map(e=>{let t=e.name||`·`,n=t.charAt(0).toUpperCase()||`·`,r=e.picture?`<img class="member-chip__avatar" src="${L(e.picture)}" alt="">`:`<span class="member-chip__initial">${L(n)}</span>`,i;if(e.isOwner)i=`<span class="member-chip__role member-chip__role--owner">👑 Owner</span>`;else if(e.isMember){let t=e.role===`planner`?`Planner`:e.role===`budgeteer`?`Budgeteer`:`Relaxer`;i=`<span class="member-chip__role member-chip__role--${e.role===`planner`?`planner`:e.role===`budgeteer`?`budgeteer`:`relaxer`}">${t}</span>`}else i=e.isPending?`<span class="member-chip__role member-chip__role--companion">⏳ Pending</span>`:`<span class="member-chip__role member-chip__role--relaxer">Relaxer</span>`;return`<div class="member-chip ${e.isOwner?`member-chip--owner`:``}">${r}<span class="member-chip__name">${L(t)}</span>${i}</div>`}).join(``)}</div>`})();if(w.innerHTML=`
        <div style="display: flex; flex-direction: column; margin-bottom: 24px;">
            <div style="display: flex; align-items: center; gap: 12px;">
                ${t?`
                    <button id="resetMapViewBtn" title="Reset the map view to show the whole trip">
                        <h2 style="font-size: var(--font-3xl); letter-spacing: -0.03em; margin: 0; font-weight: 800; color: #002d5b;">${L(E)}</h2>
                    </button>
                `:`
                    <h2 style="font-size: 1.8rem; letter-spacing: -0.03em; margin: 0; font-weight: 800; color: #002d5b;">${L(E)}</h2>
                `}
                ${t?`
                    ${D?`
                        <button id="editTripBtn" class="icon-btn-square" title="Edit trip name and location">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                        </button>
                    `:``}
                    ${(()=>{let e=``;return t.placeId?e=`https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(t.placeId)}`:typeof t.lat==`number`&&typeof t.lng==`number`?e=`https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lng}`:t.country&&(e=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.country)}`),e?`
                            <a href="${e}" target="_blank" rel="noopener" class="icon-btn-square" title="Open this trip's location in Google Maps" aria-label="Open in Google Maps">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                    <polyline points="15 3 21 3 21 9"></polyline>
                                    <line x1="10" y1="14" x2="21" y2="3"></line>
                                </svg>
                            </a>
                        `:``})()}
                    ${O?``:`
                        <span class="trip-role-badge trip-role-badge--relaxer" title="You're a Relaxer on this trip — view-only">👁 Relaxer</span>
                    `}
                `:``}
            </div>
            <p style="font-size: 0.95rem; color: var(--text-secondary); margin: 6px 0 0; font-weight: 500;">${l.length} Day${l.length===1?``:`s`} of adventure</p>
        </div>

        ${t?`
            <nav class="home-tabnav" role="tablist">
                <button class="home-tabnav__tab${U===`days`?` is-active`:``}" data-home-tab="days" role="tab">Path</button>
                <button class="home-tabnav__tab${U===`companions`?` is-active`:``}" data-home-tab="companions" role="tab">Companions</button>
                <button class="home-tabnav__tab${U===`shortlist`?` is-active`:``}" data-home-tab="shortlist" role="tab">Shortlist${(t.markedPlaces||[]).filter(e=>e.forManual).length>0?` <span style="background:rgba(255,149,0,0.15); color:#ff9500; padding:1px 6px; border-radius:999px; font-size:0.7rem; font-weight:800; margin-left:2px;">${(t.markedPlaces||[]).filter(e=>e.forManual).length}</span>`:``}</button>
            </nav>
        `:``}

        <!-- Companions tab content. Render order matters: this sits ABOVE
             the Days tab in source so the timeline stays the document
             outline anchor; the active-tab CSS swap hides whichever isn't
             active without remounting either. -->
        ${t?`
            <div class="home-tab-content${U===`companions`?` is-active`:``}" data-home-tab="companions">
                <div class="trip-companions-section">
                    <button id="tripCompanionsBtn" class="trip-companions-pill" title="${D?`Pick which account companions are on this trip`:`See who is on this trip`}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                        <span>Companions on this trip</span>
                        <span class="trip-companions-pill__count">${D?(t.companions||[]).length:(t.members||[]).length}</span>
                    </button>
                    ${ee}
                </div>
            </div>

            <!-- Shortlist tab — places the user marked from the home
                 map InfoWindow with "📝 Shortlist it". Cards show the
                 place and a remove button; the day-and-time-of-day
                 dropdowns appear when the trip has numbered days, so
                 the user can tag each place to a day they're planning
                 to visit. -->
            <!-- Shortlist tab content. Pure pool of places — no day/time
                 dropdowns. The user assigns places to a day by clicking
                 AM/PM/Eve in the Day Detail modal, which writes the line
                 directly into the day's textarea (so the place's actual
                 home is the day plan itself, not metadata on the place).
                 This avoids the prior "tag stamped, textarea forgotten"
                 mismatch where shortlist showed Tagged for Day 2 but
                 Day 2's plan was empty. -->
            <div class="home-tab-content${U===`shortlist`?` is-active`:``}" data-home-tab="shortlist">
                ${(()=>{let e=(t.markedPlaces||[]).filter(e=>e.forManual);return e.length===0?`
                            <div class="card glass" style="padding: 28px; border-radius: 18px; border: 1.5px dashed rgba(255, 149, 0, 0.35); background: rgba(255, 149, 0, 0.04); text-align:center;">
                                <div style="font-size:2rem; margin-bottom:8px;">📝</div>
                                <h3 style="margin:0 0 6px; color:#ff9500; font-weight:800;">No shortlisted places yet</h3>
                                <p style="margin:0; color:var(--text-secondary); font-size:0.9rem;">On the home map, click any pin and hit <strong>📝 Shortlist it</strong> to add it here. Then open any day's <strong>Full Plan</strong> and tap AM / PM / Eve to drop a place into that day.</p>
                            </div>
                        `:`
                        <div style="margin-bottom: 12px; font-size:0.8rem; color:var(--text-secondary);">Open any day's <strong>Full Plan</strong> below and use AM / PM / Eve to drop a shortlisted place into the matching textarea.</div>
                        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap:12px;">
                            ${e.map(e=>`
                                <div class="shortlist-card" data-place-id="${L(e.placeId)}" style="background:white; border:1.5px solid ${e.color}; border-radius:14px; padding:14px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); display:flex; align-items:flex-start; gap:10px;">
                                    <span style="font-size:1.4rem; line-height:1;">${e.icon}</span>
                                    <div style="flex:1; min-width:0;">
                                        <div style="font-weight:800; color:#002d5b; font-size:0.95rem; line-height:1.25;">${L(e.name)}</div>
                                        ${e.address?`<div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">${L(e.address)}</div>`:``}
                                    </div>
                                    <button type="button" class="shortlist-remove-btn" data-place-id="${L(e.placeId)}" title="Remove from shortlist" aria-label="Remove ${L(e.name)}"
                                        style="background: rgba(255,59,48,0.08); border: 1px solid rgba(255,59,48,0.25); color:#ff3b30; border-radius: 8px; padding: 4px 8px; font-size:0.75rem; font-weight:800; cursor:pointer; flex-shrink:0;">✕</button>
                                </div>
                            `).join(``)}
                        </div>
                    `})()}
            </div>
        `:``}

        <div class="home-tab-content${U===`days`?` is-active`:``}" data-home-tab="days" style="display: flex; flex-direction: column; gap: 12px; position: relative; padding-left: 20px;">
            <!-- Subtle Timeline Line -->
            <div style="position: absolute; left: 10px; top: 10px; bottom: 10px; width: 2px; background: linear-gradient(180deg, var(--accent-blue) 0%, rgba(0,113,227,0.05) 100%); border-radius: 1px; opacity: 0.3;"></div>

            ${l.map(e=>{let n=H===e.id,r=e.dayNumber===0;return`
                <div class="day-row${n?` is-open`:``}">
                    <!-- Timeline Dot — Starting Point uses a green dot to distinguish from numbered days -->
                    <div style="position: absolute; left: -14px; top: 22px; width: 10px; height: 10px; border-radius: 50%; background: ${n?r?`#34c759`:`var(--accent-blue)`:`white`}; border: 2px solid ${r?`#34c759`:`var(--accent-blue)`}; z-index: 2; box-shadow: 0 0 0 4px white;"></div>

                    <!-- MAIN CARD: state-driven border via CSS class.
                         genesis -> thin green; pinned -> thin blue;
                         unpinned -> dashed amber plus a Pin this day pill.
                         Class rules use !important to win over the inline
                         border shorthand (see .day-card--* in index.css). -->
                    <div class="day-card card glass${n?` is-open`:``} ${r?`day-card--genesis`:e.lat||e.lng?`day-card--pinned`:`day-card--unpinned`}"
                         data-day-id="${e.id}"
                         role="button" tabindex="0"
                         aria-label="${L(e.name||`Day ${e.dayNumber}`)} — ${n?`collapse`:`expand`}"
                         style="flex: 1; padding: 20px 28px; border-radius: 28px; border: 1.5px solid ${n?`var(--accent-blue)`:`rgba(0,0,0,0.05)`}; background: ${n?`rgba(255,255,255,0.95)`:`white`}; cursor: pointer; box-shadow: ${n?`0 20px 40px rgba(0,0,0,0.1)`:`none`};">

                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div style="display: flex; align-items: center; gap: 20px;">
                                ${r?`
                                    <div style="background: linear-gradient(135deg, #34c759, #30b350); color: white; width: 54px; height: 54px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; font-family: -apple-system, sans-serif; box-shadow: 0 10px 20px rgba(52,199,89,0.18);">
                                        <svg width="30" height="30" viewBox="0 0 48 48" aria-hidden="true">
                                            <path d="M 24,11 L 27.06,18.96 L 35.55,19.49 L 28.92,24.92 L 31.0,33.16 L 24,28.6 L 17,33.16 L 19.08,24.92 L 12.45,19.49 L 20.94,18.96 Z" fill="white"/>
                                        </svg>
                                    </div>
                                `:`
                                    <div style="background: linear-gradient(135deg, var(--accent-blue), #9b59b6); color: white; width: 54px; height: 54px; border-radius: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: -apple-system, sans-serif; box-shadow: 0 10px 20px rgba(0,113,227,0.15);">
                                        <span style="font-size: 0.65rem; font-weight: 800; text-transform: uppercase; opacity: 0.8; letter-spacing: 0.05em; line-height: 1;">Day</span>
                                        <span style="font-size: 1.4rem; font-weight: 800; line-height: 1.1;">${e.dayNumber}</span>
                                    </div>
                                `}
                                <div style="display: flex; flex-direction: column;">
                                    <h3 style="margin: 0; font-size: 1.3rem; font-weight: 800; color: #002d5b; letter-spacing: -0.02em;">${r?`Trip Genesis`:L(e.name)}</h3>
                                    <div style="font-size: 0.9rem; color: var(--text-secondary); font-weight: 600; margin-top: 4px; display: flex; align-items: center; gap: 8px;">
                                        ${r?`<span>${t&&t.country?ae(t.country):`Where the trip begins`}</span>`:`<span>📅 ${le(e.date)||`Set date`}</span>`}
                                        ${e.lat&&!r?`<span style="color: var(--accent-blue); opacity: 0.6;">•</span> <span style="color: var(--accent-blue);">📍 Location Set</span>`:``}
                                        ${!r&&!e.lat&&!e.lng?`<span style="color: rgba(0,0,0,0.25);">•</span> <span class="day-card__pin-hint">📌 Pin this day</span>`:``}
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
                                <p style="margin: 0; font-size: 0.95rem; line-height: 1.5; color: #002d5b; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${L(e.notes)}</p>
                            </div>
                        `:``}
                    </div>

                    <!-- RIGHT-SIDE ACTIONS — only rendered for users with edit
                         rights. Relaxers see the day cards as read-only,
                         no actions panel beside them. Sits AFTER the card so
                         the flex row lays card → panel left-to-right. -->
                    ${O?`
                    <div class="day-actions-panel${n?` is-open`:``}">
                        <div class="day-actions-label">Actions</div>

                        ${B===e.id?`
                            <div style="display: flex; gap: var(--space-1);">
                                <button class="day-action-btn day-action-btn--success day-pin-save-btn" data-day-id="${e.id}" style="flex: 2; justify-content: center;">Save Pin</button>
                                <button class="day-action-btn day-action-btn--danger-fill day-pin-delete-btn" data-day-id="${e.id}" style="flex: 1; justify-content: center;">X</button>
                            </div>
                        `:`
                            <button class="day-action-btn day-action-btn--brand day-pin-toggle-btn" data-day-id="${e.id}">
                                <span>${e.lat?`📍 Edit Pin Location`:`📍 Add Pin to Map`}</span>
                            </button>
                        `}

                        <button class="day-action-btn day-action-btn--neutral day-journaling-btn" data-day-id="${e.id}">
                            <span>✍️ Journaling</span>
                        </button>

                        <button class="day-action-btn day-action-btn--neutral day-photos-btn" data-day-id="${e.id}">
                            <span>📸 Add Photos</span>
                        </button>

                        <button class="day-action-btn day-action-btn--neutral day-documents-btn" data-day-id="${e.id}">
                            <span>📄 Documents</span>
                        </button>

                        ${(()=>{if(!e.lat||r)return``;let n=t?.id||``,i=b.preferences?.pillEpicenters?.[n]===e.id,a=i?`day-action-btn day-action-btn--success day-set-epicenter-btn`:`day-action-btn day-action-btn--neutral day-set-epicenter-btn`,o=i?`🎯 Search center (active)`:`🎯 Set as search center`;return`<button class="${a}" data-day-id="${e.id}"><span>${o}</span></button>`})()}

                        ${r?`
                            <!-- Genesis is the trip's anchor — pillEpicenters,
                                 the wide-area pill searches, and the lazy
                                 sessionStorage flag all key off it. Removing
                                 it from the menu (vs. only blocking the
                                 confirm) makes the contract obvious. -->
                            <div class="day-action-note" style="margin-top: var(--space-1); padding: 8px 12px; background: rgba(52,199,89,0.06); border: 1px solid rgba(52,199,89,0.18); border-radius: 10px; font-size: 0.72rem; color: rgba(0,0,0,0.55); line-height: 1.35; text-align:center;">
                                ⭐ Trip Genesis can't be deleted — it anchors the trip.
                            </div>
                        `:`
                            <button class="day-action-btn day-action-btn--danger day-delete-btn" data-day-id="${e.id}" style="margin-top: var(--space-1);">
                                <span>🗑️ Delete Day</span>
                            </button>
                        `}
                    </div>
                    `:``}
                </div>
            `}).join(``)}
            
            <!-- ADD DAY BUTTON — hidden for non-planners (relaxers can't
                 mutate the day list). -->
            ${O?`
            <div id="addDayBtn">
                <div class="add-dot" style="width: 14px; height: 14px; border-radius: 50%; border: 2px dashed var(--accent-blue); background: transparent; margin-left: -2px;"></div>
                <div class="add-text" style="font-weight: 700; color: var(--text-secondary); font-size: var(--font-lg); letter-spacing: -0.01em;">+ Add a new day to your journey</div>
            </div>
            `:``}
        </div>
    `,t&&(e.appendChild(w),w.addEventListener(`click`,e=>{let n=e.target;if(!n)return;if(n.closest(`#resetMapViewBtn`)){let e=window.activeMap;if(!e||!t)return;let n=google,r=new n.maps.LatLngBounds;typeof t.lat==`number`&&typeof t.lng==`number`&&r.extend({lat:t.lat,lng:t.lng});let i=(b.tripDays||[]).filter(e=>e.tripId===t.id);for(let e of i)typeof e.lat==`number`&&r.extend({lat:e.lat,lng:e.lon||e.lng});if(!r.isEmpty())e.fitBounds(r,80);else if(t.viewport){let r=t.viewport;e.fitBounds(new n.maps.LatLngBounds({lat:r.south,lng:r.west},{lat:r.north,lng:r.east}))}return}let r=n.closest(`.home-tabnav__tab`)?.dataset.homeTab;if(r===`days`||r===`companions`||r===`shortlist`){U=r,w.querySelectorAll(`.home-tabnav__tab`).forEach(e=>{e.classList.toggle(`is-active`,e.dataset.homeTab===U)}),w.querySelectorAll(`.home-tab-content`).forEach(e=>{e.classList.toggle(`is-active`,e.dataset.homeTab===U)});return}if(n.closest(`#editTripBtn`)){Ee(t);return}if(n.closest(`#tripCompanionsBtn`)||n.closest(`#tripMembersPanel`)){xe(t)?Oe(t.id):ke(t.id);return}let i=n.closest(`.day-pin-save-btn`);if(i?.dataset.dayId){Ge(i.dataset.dayId);return}let a=n.closest(`.day-pin-delete-btn`);if(a?.dataset.dayId){Ke(a.dataset.dayId);return}let o=n.closest(`.day-pin-toggle-btn`);if(o?.dataset.dayId){let e=o.dataset.dayId;b.tripDays.find(t=>t.id===e)?.lat?We(e):Ue(e);return}let s=n.closest(`.day-journaling-btn`);if(s?.dataset.dayId){Ye(s.dataset.dayId);return}let c=n.closest(`.day-photos-btn`);if(c?.dataset.dayId){Xe(c.dataset.dayId);return}let l=n.closest(`.day-documents-btn`);if(l?.dataset.dayId){Ze(l.dataset.dayId);return}let u=n.closest(`.day-set-epicenter-btn`);if(u?.dataset.dayId&&t){let e=u.dataset.dayId;b.preferences||={mapDefaultPois:[`sights`,`parks`,`transit`],poiFilters:{},pillEpicenters:{}},b.preferences.pillEpicenters||(b.preferences.pillEpicenters={}),b.preferences.pillEpicenters[t.id]===e?delete b.preferences.pillEpicenters[t.id]:b.preferences.pillEpicenters[t.id]=e,T(`state:changed`),q(`home`);return}let d=n.closest(`.shortlist-remove-btn`);if(d?.dataset.placeId&&t){Fe(t,d.dataset.placeId),T(`state:changed`),Q(t),q(`home`);return}let f=n.closest(`.day-delete-btn`);if(f?.dataset.dayId){qe(f.dataset.dayId);return}let p=n.closest(`.day-detail-btn`);if(p?.dataset.dayId){Qe(p.dataset.dayId);return}let m=n.closest(`.day-card`);if(m?.dataset.dayId){He(m.dataset.dayId);return}}),setTimeout(()=>{let t=e.querySelector(`#addDayBtn`);t&&(t.onclick=()=>De())},0)),b.hideQuickAccess!==!1){let t=document.createElement(`div`);t.style.textAlign=`center`,t.style.marginTop=`40px`,t.innerHTML=`
            <button class="btn-glass-light">
                🧭 Show Quick Access
            </button>
        `;let n=t.querySelector(`button`);n&&(n.onclick=()=>{b.hideQuickAccess=!1,T(`state:changed`),q(`home`)}),e.appendChild(t)}else u.innerHTML=`
            <div class="card glass" style="padding: 32px; border-radius: 28px; border: 1.5px solid ${C?`rgba(0,0,0,0.05)`:`rgba(0, 122, 255, 0.15)`}; background: ${C?`rgba(255,255,255,0.4)`:`linear-gradient(165deg, rgba(255,255,255,0.9), rgba(240,247,255,0.8))`}; position: relative;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="background: ${C?`#000000`:`var(--accent-blue)`}; color: white; width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">${C?`⚡️`:`🧭`}</div>
                        <h2 style="margin: 0; font-size: 1.5rem; letter-spacing: -0.02em; color: #002d5b;">${C?`Quick Access`:`Getting Started Guide`}</h2>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        ${C?`<span style="font-size: 0.75rem; font-weight: 800; color: rgba(0,45,91,0.4); text-transform: uppercase; letter-spacing: 0.05em;">Toolbar</span>`:``}
                        <button id="hideQuickAccessBtn" class="pill-btn-warn-hover">Hide</button>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
                    ${S.map((e,t)=>{let n=!C&&e.done;return`
                        <button type="button" class="card-button-reset guide-step-card" data-index="${t}" style="display: flex; align-items: center; gap: var(--space-4); padding: var(--space-4) var(--space-5); background: ${n?`rgba(52, 199, 89, 0.08)`:`white`}; border-radius: var(--radius-xl); border: 1px solid ${n?`rgba(52, 199, 89, 0.2)`:`rgba(0,0,0,0.05)`}; cursor: pointer; position: relative; overflow: hidden;">
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
                        </button>
                    `}).join(``)}
                </div>
            </div>
        `,setTimeout(()=>{u.addEventListener(`click`,e=>{let t=e.target;if(!t)return;let n=t.closest(`[data-guide-action]`);if(n){let e=n.dataset.guideAction;e===`open-add-day`?De():e===`navigate-expenses`?q(`expenses`):e===`navigate-upload`&&q(`upload`);return}let r=t.closest(`.guide-step-card`);r?.dataset.index&&S[Number(r.dataset.index)]?.action()});let e=u.querySelector(`#hideQuickAccessBtn`);e&&(e.onclick=e=>{e.stopPropagation(),b.hideQuickAccess=!0,T(`state:changed`),q(`home`)})},0),e.appendChild(u);return je(e),e}var Ye=e=>{let t=b.tripDays.find(t=>t.id===e);if(!t)return;let{root:n,close:r}=O({variant:`glass-light`,cardStyle:`width: 580px;`,innerHTML:`
            <h2 style="font-size: var(--font-3xl); margin-bottom: var(--space-2); color: #002d5b; font-weight: 800; letter-spacing: -0.04em;">Day ${t.dayNumber} Journaling</h2>
            <p class="text-subtitle">Capture your memories and stories from ${L(t.name)}</p>
            <textarea id="journalText" class="glass-input-light" style="height: 260px; font-size: 1.05rem; line-height: 1.6; margin-bottom: var(--space-5); resize: vertical; display: block;" placeholder="What happened today? How did you feel?">${L(t.notes||``)}</textarea>
            <div style="display: flex; gap: var(--space-3);">
                <button id="saveJournalBtn" class="btn-primary" style="flex: 2; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">Save Story</button>
                <button id="closeJournalBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">Close</button>
            </div>
        `});I(n,`#closeJournalBtn`).onclick=()=>r(),I(n,`#saveJournalBtn`).onclick=async()=>{t.notes=I(n,`#journalText`).value,T(`state:changed`),await $(t),N(`Memories saved!`),r(),q(`home`,null,!0)}},Xe=e=>{let t=b.tripDays.find(t=>t.id===e);if(!t)return;t.photos||=[];let{root:n,close:r}=O({variant:`glass-light`,cardStyle:`width: 500px;`,innerHTML:`
            <h2 class="h2-display">Photo Gallery</h2>
            <p class="text-subtitle">Add images that define your Day ${t.dayNumber}</p>
            <div id="photoList" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3); margin-bottom: var(--space-6); max-height: 300px; overflow-y: auto; padding: var(--space-1);">
                ${t.photos.length===0?`<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: var(--space-10);">No photos added yet.</p>`:t.photos.map((t,n)=>`
                        <div style="position: relative; aspect-ratio: 1; border-radius: var(--radius-lg); overflow: hidden; border: 1px solid rgba(0,0,0,0.05);">
                            <img src="${t}" alt="Trip photo" style="width: 100%; height: 100%; object-fit: cover;">
                            <button class="remove-photo-btn" data-day-id="${e}" data-photo-idx="${n}" aria-label="Remove photo" style="position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; border-radius: 50%; background: rgba(255,59,48,0.8); color: white; border: none; font-size: var(--font-2xs); font-weight: 800; cursor: pointer;">✕</button>
                        </div>
                    `).join(``)}
            </div>
            <div style="display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-6);">
                <label class="upload-dropzone" id="uploadLabel">
                    <span id="uploadStatusText">📤 Upload Photo</span>
                    <input type="file" id="photoUpload" accept="image/*" style="display: none;">
                </label>
                <div style="display: flex; gap: var(--space-2); align-items: center;">
                    <div class="divider-h"></div>
                    <span style="font-size: var(--font-2xs); color: var(--text-secondary); font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">OR</span>
                    <div class="divider-h"></div>
                </div>
                <div style="display: flex; gap: var(--space-2);">
                    <input type="text" id="photoUrl" class="glass-input" placeholder="Paste image URL here..." style="flex: 1; padding: var(--space-3); border-radius: 14px; font-size: var(--font-base);">
                    <button id="addPhotoBtn" class="btn-primary" style="padding: var(--space-3) var(--space-5);">Add</button>
                </div>
            </div>
            <button id="closePhotosBtn" class="btn-neutral" style="width: 100%; border-radius: var(--radius-lg);">Done</button>
        `}),i=I(n,`#photoUpload`);i.onchange=async i=>{let a=i.target.files?.[0];if(!a)return;let o=I(n,`#uploadStatusText`);o.textContent=`⌛ Uploading...`;let s=await Qt(a);s&&s.url?(t.photos.push(s.url),T(`state:changed`),await $(t),r(),Xe(e)):o.textContent=`❌ Failed. Try again.`};let a=async(e,n)=>{t.photos.splice(n,1),T(`state:changed`),await $(t),r(),Xe(e)};n.addEventListener(`click`,e=>{let t=e.target?.closest(`.remove-photo-btn`);t?.dataset.dayId&&t.dataset.photoIdx&&a(t.dataset.dayId,parseInt(t.dataset.photoIdx,10))}),I(n,`#addPhotoBtn`).onclick=async()=>{let i=I(n,`#photoUrl`).value;i&&(t.photos.push(i),T(`state:changed`),await $(t),r(),Xe(e))},I(n,`#closePhotosBtn`).onclick=()=>{r(),q(`home`,null,!0)}},Ze=e=>{let t=b.tripDays.find(t=>t.id===e);if(!t)return;t.documents||=[];let{root:n,close:r}=O({variant:`glass-light`,cardStyle:`width: 460px;`,innerHTML:`
            <h2 class="h2-display">Documents</h2>
            <p class="text-subtitle">Tickets, bookings, and important info</p>
            <div id="docList" style="display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-6); max-height: 250px; overflow-y: auto;">
                ${t.documents.length===0?`<p style="text-align: center; color: var(--text-secondary); padding: var(--space-8);">No documents linked.</p>`:t.documents.map((t,n)=>`
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-3) var(--space-4); background: white; border-radius: var(--radius-md); border: 1px solid rgba(0,0,0,0.05);">
                            <div style="display: flex; align-items: center; gap: var(--space-2); overflow: hidden;">
                                <span style="font-size: 1.2rem;">📄</span>
                                <a href="${t.url}" target="_blank" style="color: var(--accent-blue); text-decoration: none; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${t.name}</a>
                            </div>
                            <button class="remove-doc-btn" data-day-id="${e}" data-doc-idx="${n}" aria-label="Remove document" style="background: none; border: none; color: #ff3b30; font-weight: 800; cursor: pointer;">✕</button>
                        </div>
                    `).join(``)}
            </div>
            <div style="display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-6);">
                <label class="upload-dropzone" id="uploadDocLabel">
                    <span id="uploadDocStatusText">📤 Upload Document</span>
                    <input type="file" id="docUpload" style="display: none;">
                </label>
                <div style="display: flex; gap: var(--space-2); align-items: center;">
                    <div class="divider-h"></div>
                    <span style="font-size: var(--font-xs); color: var(--text-secondary); font-weight: 800;">OR</span>
                    <div class="divider-h"></div>
                </div>
                <input type="text" id="docName" class="glass-input" placeholder="Document Name (e.g. Flight Ticket)" style="padding: var(--space-3); border-radius: var(--radius-md);">
                <div style="display: flex; gap: var(--space-2);">
                    <input type="text" id="docUrl" class="glass-input" placeholder="Link to document (Google Drive, URL...)" style="flex: 1; padding: var(--space-3); border-radius: var(--radius-md);">
                    <button id="addDocBtn" class="btn-primary" style="padding: var(--space-3) var(--space-5);">Add</button>
                </div>
            </div>
            <button id="closeDocsBtn" class="btn-neutral" style="width: 100%; border-radius: var(--radius-lg);">Close</button>
        `}),i=t.documents,a=I(n,`#docUpload`);a.onchange=async a=>{let o=a.target.files?.[0];if(!o)return;let s=I(n,`#uploadDocStatusText`);s.textContent=`⌛ Uploading...`;let c=await Qt(o);c&&c.url?(i.push({name:c.name||o.name,url:c.url}),T(`state:changed`),await $(t),r(),Ze(e)):s.textContent=`❌ Failed. Try again.`};let o=async(e,n)=>{i.splice(n,1),T(`state:changed`),await $(t),r(),Ze(e)};n.addEventListener(`click`,e=>{let t=e.target?.closest(`.remove-doc-btn`);t?.dataset.dayId&&t.dataset.docIdx&&o(t.dataset.dayId,parseInt(t.dataset.docIdx,10))}),I(n,`#addDocBtn`).onclick=async()=>{let a=I(n,`#docName`).value,o=I(n,`#docUrl`).value;a&&o&&(i.push({name:a,url:o}),T(`state:changed`),await $(t),r(),Ze(e))},I(n,`#closeDocsBtn`).onclick=()=>r()},Qe=e=>{let t=b.tripDays.find(t=>t.id===e);if(!t)return;let n=b.trips.find(e=>e.id===t.tripId),r=(n?.markedPlaces||[]).filter(e=>e.forManual),i=r.length>0?`
        <div style="margin-top: var(--space-10); padding: var(--space-6); background: rgba(255, 149, 0, 0.04); border: 1px solid rgba(255, 149, 0, 0.2); border-radius: 24px;">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
                <span style="font-size: 1.2rem;">📝</span>
                <h4 style="margin:0; color:#ff9500; font-weight:800; letter-spacing:-0.01em;">From your shortlist</h4>
                <span style="margin-left:auto; font-size:0.78rem; color:var(--text-secondary);">Click AM / PM / Eve to drop a place into the matching textarea above. ✓ shows where it currently lives.</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
                ${r.map(e=>`
        <div class="day-shortlist-row" data-place-id="${L(e.placeId)}" style="display:flex; align-items:center; gap:10px; padding:10px 12px; background:white; border:1px solid ${e.color}40; border-left:3px solid ${e.color}; border-radius:10px;">
            <span style="font-size:1.2rem; line-height:1; flex-shrink:0;">${e.icon}</span>
            <div style="flex:1; min-width:0;">
                <div style="font-weight:700; color:#002d5b; font-size:0.9rem; line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${L(e.name)}</div>
                ${e.address?`<div style="font-size:0.72rem; color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${L(e.address)}</div>`:``}
            </div>
            <div style="display:flex; gap:4px; flex-shrink:0;">
                <button type="button" class="day-shortlist-add-btn" data-place-id="${L(e.placeId)}" data-time="morning" title="Add to Morning"
                    style="background:rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.2); color:var(--accent-blue); padding:5px 10px; border-radius:6px; font-size:0.7rem; font-weight:700; cursor:pointer;">🌅 AM</button>
                <button type="button" class="day-shortlist-add-btn" data-place-id="${L(e.placeId)}" data-time="afternoon" title="Add to Afternoon"
                    style="background:rgba(255,149,0,0.08); border:1px solid rgba(255,149,0,0.25); color:#ff9500; padding:5px 10px; border-radius:6px; font-size:0.7rem; font-weight:700; cursor:pointer;">☀️ PM</button>
                <button type="button" class="day-shortlist-add-btn" data-place-id="${L(e.placeId)}" data-time="evening" title="Add to Evening"
                    style="background:rgba(88,86,214,0.08); border:1px solid rgba(88,86,214,0.25); color:#5856d6; padding:5px 10px; border-radius:6px; font-size:0.7rem; font-weight:700; cursor:pointer;">🌙 Eve</button>
            </div>
        </div>
    `).join(``)}
            </div>
        </div>
    `:``,a=null,{root:o,close:s}=O({cardClass:`card glass`,cardStyle:`width: 800px; max-height: 90vh; overflow-y: auto; padding: var(--space-12); border-radius: 48px; background: white; border: 1px solid rgba(0,0,0,0.1);`,innerHTML:`
            <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: var(--space-10);">
                <div>
                    <div style="display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2);">
                        <div style="background: var(--accent-blue); color: white; padding: var(--space-1) var(--space-3); border-radius: var(--radius-sm); font-weight: 800; font-size: var(--font-xs); text-transform: uppercase;">Day ${t.dayNumber}</div>
                        <div style="color: var(--text-secondary); font-weight: 600; font-size: var(--font-base);">${le(t.date)}</div>
                    </div>
                    <h2 style="font-size: 2.5rem; color: #002d5b; font-weight: 800; letter-spacing: -0.04em; margin: 0;">${L(t.name)}</h2>
                </div>
                <button id="closeDetailBtn" class="close-x-btn" aria-label="Close">✕</button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-10);">
                <div style="display: flex; flex-direction: column; gap: var(--space-6);">
                    <div class="subcard-soft">
                        <h4 class="text-tag">Morning</h4>
                        <textarea class="plain-textarea plan-input" data-time="morning" placeholder="Morning plans...">${t.plan?.morning||``}</textarea>
                    </div>
                    <div class="subcard-soft">
                        <h4 class="text-tag" style="--accent: 255,149,0;">Afternoon</h4>
                        <textarea class="plain-textarea plan-input" data-time="afternoon" placeholder="Afternoon plans...">${t.plan?.afternoon||``}</textarea>
                    </div>
                    <div class="subcard-soft">
                        <h4 class="text-tag" style="--accent: 88,86,214;">Evening</h4>
                        <textarea class="plain-textarea plan-input" data-time="evening" placeholder="Evening plans...">${t.plan?.evening||``}</textarea>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: var(--space-6);">
                    <div style="flex: 1; background: rgba(0,113,227,0.05); padding: var(--space-6); border-radius: 24px; border: 1px solid rgba(0,113,227,0.1);">
                        <h4 class="text-tag">Personal Notes</h4>
                        <textarea id="detailNotes" class="plain-textarea plain-textarea--no-resize" style="height: 200px;" placeholder="Private thoughts about this day...">${L(t.notes||``)}</textarea>
                    </div>
                    <div style="background: #000; padding: var(--space-6); border-radius: 24px; color: white;">
                        <h4 class="text-tag" style="--accent: 52,199,89;">Expert Tip</h4>
                        <p style="margin: 0; font-size: var(--font-md); line-height: 1.5; opacity: 0.9;">${L(t.tip||`Always keep a portable charger and a small bottle of water in your bag for long exploration days.`)}</p>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <button id="saveDetailBtn" class="btn-primary" style="width: 100%; padding: var(--space-5); border-radius: var(--radius-xl); font-size: var(--font-xl);">Done</button>
                        <div id="autosaveStatus" style="text-align:center; font-size:0.7rem; color:var(--text-secondary); font-weight:600; min-height:1em;">Changes save automatically</div>
                    </div>
                </div>
            </div>
            ${i}
        `,onClose:()=>a?.()}),c=o.querySelectorAll(`textarea.plan-input`),l=I(o,`#detailNotes`),u=I(o,`#autosaveStatus`),d=null,f=!1,p=(e,t=`var(--text-secondary)`)=>{u.textContent=e,u.style.color=t},m=()=>{t.plan={morning:o.querySelector(`textarea.plan-input[data-time="morning"]`)?.value??``,afternoon:o.querySelector(`textarea.plan-input[data-time="afternoon"]`)?.value??``,evening:o.querySelector(`textarea.plan-input[data-time="evening"]`)?.value??``},t.notes=l?.value??``},h=async()=>{d&&=(clearTimeout(d),null),m(),T(`state:changed`),f=!0,p(`Saving…`);try{await $(t),p(`Saved ✓`,`#1a6b3c`),setTimeout(()=>{u.textContent===`Saved ✓`&&p(`Changes save automatically`)},1400)}catch(e){console.error(`Day auto-save failed:`,e),p(`Save failed — try again`,`#ff3b30`)}finally{f=!1}},g=()=>{m(),T(`state:changed`),p(`Editing…`),d&&clearTimeout(d),d=setTimeout(()=>{d=null,h()},700)};a=()=>{(d||f)&&(m(),T(`state:changed`),h().catch(e=>console.error(`Day flush-on-close failed:`,e)))};let _=()=>{let e={morning:(o.querySelector(`textarea.plan-input[data-time="morning"]`)?.value||``).toLowerCase(),afternoon:(o.querySelector(`textarea.plan-input[data-time="afternoon"]`)?.value||``).toLowerCase(),evening:(o.querySelector(`textarea.plan-input[data-time="evening"]`)?.value||``).toLowerCase()};o.querySelectorAll(`.day-shortlist-add-btn`).forEach(t=>{let n=t,i=n.dataset.placeId,a=n.dataset.time;if(!i||!a)return;let o=r.find(e=>e.placeId===i);if(!o)return;let s=e[a].includes(o.name.toLowerCase()),c=a===`morning`?`🌅 AM`:a===`afternoon`?`☀️ PM`:`🌙 Eve`;n.textContent=s?`✓ ${c}`:c,n.style.background=s?a===`morning`?`rgba(0,113,227,0.22)`:a===`afternoon`?`rgba(255,149,0,0.22)`:`rgba(88,86,214,0.22)`:a===`morning`?`rgba(0,113,227,0.08)`:a===`afternoon`?`rgba(255,149,0,0.08)`:`rgba(88,86,214,0.08)`})};_(),c.forEach(e=>{e.addEventListener(`input`,()=>{g(),_()})}),l?.addEventListener(`input`,()=>{g()}),o.addEventListener(`click`,e=>{let t=e.target?.closest(`.day-shortlist-add-btn`);if(!t)return;let i=t.dataset.placeId,a=t.dataset.time;if(!i||!a||!n)return;let s=r.find(e=>e.placeId===i);if(!s)return;let c=o.querySelector(`textarea.plan-input[data-time="${a}"]`);if(!c)return;let l=`- ${s.name}`;if(c.value.toLowerCase().includes(s.name.toLowerCase())){t.animate([{transform:`translateX(0)`},{transform:`translateX(-3px)`},{transform:`translateX(3px)`},{transform:`translateX(0)`}],{duration:220,easing:`ease-out`});return}c.value=c.value.trim().length>0?`${c.value.trim()}\n${l}`:l,h(),_()}),I(o,`#closeDetailBtn`).onclick=async()=>{(d||f)&&await h(),s()},I(o,`#saveDetailBtn`).onclick=async()=>{await h(),N(`Itinerary updated!`),s(),q(`home`)}},W=e=>String(e).padStart(2,`0`),$e=[{key:`grocer`,icon:`🛒`,color:`#34c759`},{key:`supermarket`,icon:`🛒`,color:`#34c759`},{key:`coffee`,icon:`☕`,color:`#8b4513`},{key:`cafe`,icon:`☕`,color:`#8b4513`},{key:`restaurant`,icon:`🍽️`,color:`#ff3b30`},{key:`breakfast`,icon:`🥐`,color:`#ff9f0a`},{key:`lunch`,icon:`🥗`,color:`#34c759`},{key:`dinner`,icon:`🍽️`,color:`#ff3b30`},{key:`food`,icon:`🍔`,color:`#ff3b30`},{key:`snack`,icon:`🍪`,color:`#ff9f0a`},{key:`dessert`,icon:`🍦`,color:`#ff2d55`},{key:`drink`,icon:`🍻`,color:`#ff9500`},{key:`bar`,icon:`🍹`,color:`#ff9500`},{key:`alcohol`,icon:`🍷`,color:`#9b1c2c`},{key:`flight`,icon:`✈️`,color:`#007aff`},{key:`plane`,icon:`✈️`,color:`#007aff`},{key:`airport`,icon:`🛬`,color:`#007aff`},{key:`taxi`,icon:`🚕`,color:`#ffd60a`},{key:`uber`,icon:`🚕`,color:`#ffd60a`},{key:`train`,icon:`🚆`,color:`#5ac8fa`},{key:`metro`,icon:`🚇`,color:`#5ac8fa`},{key:`bus`,icon:`🚌`,color:`#5ac8fa`},{key:`fuel`,icon:`⛽`,color:`#8e8e93`},{key:`gas`,icon:`⛽`,color:`#8e8e93`},{key:`parking`,icon:`🅿️`,color:`#8e8e93`},{key:`rental`,icon:`🚗`,color:`#007aff`},{key:`car`,icon:`🚗`,color:`#007aff`},{key:`transport`,icon:`🚌`,color:`#007aff`},{key:`hotel`,icon:`🏨`,color:`#5856d6`},{key:`hostel`,icon:`🛏️`,color:`#5856d6`},{key:`airbnb`,icon:`🏠`,color:`#5856d6`},{key:`accommod`,icon:`🏨`,color:`#5856d6`},{key:`lodging`,icon:`🏨`,color:`#5856d6`},{key:`ticket`,icon:`🎟️`,color:`#af52de`},{key:`museum`,icon:`🏛️`,color:`#af52de`},{key:`tour`,icon:`🗺️`,color:`#af52de`},{key:`activity`,icon:`🎫`,color:`#af52de`},{key:`entertain`,icon:`🎭`,color:`#af52de`},{key:`shop`,icon:`🛍️`,color:`#ff2d55`},{key:`cloth`,icon:`👕`,color:`#ff2d55`},{key:`gift`,icon:`🎁`,color:`#ff2d55`},{key:`health`,icon:`💊`,color:`#34c759`},{key:`pharmac`,icon:`💊`,color:`#34c759`},{key:`medic`,icon:`🩺`,color:`#34c759`},{key:`phone`,icon:`📱`,color:`#5ac8fa`},{key:`internet`,icon:`🌐`,color:`#5ac8fa`},{key:`fee`,icon:`💸`,color:`#8e8e93`},{key:`tip`,icon:`💵`,color:`#34c759`}],et=[{icon:`🌍`,color:`#0071e3`},{icon:`🎒`,color:`#9b59b6`},{icon:`📸`,color:`#ff9500`},{icon:`🗺️`,color:`#34c759`},{icon:`🎨`,color:`#ff2d55`},{icon:`🔥`,color:`#ff3b30`},{icon:`⭐`,color:`#ffd60a`},{icon:`🌊`,color:`#5ac8fa`}];function tt(e){if(!e||!String(e).trim())return null;let t={};for(let n of String(e).split(/[,;]/)){let e=n.match(/^\s*(.+?)\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*$/);if(!e)continue;let r=e[1].trim(),i=parseFloat(e[2]);!r||isNaN(i)||(t[r]=(t[r]||0)+i)}return Object.keys(t).length>0?t:null}function nt(e){if(!e)return!1;let t=String(e).trim().toLowerCase();return t===`y`||t===`yes`||t===`true`||t===`1`}function rt(e){let t=(e||``).toLowerCase();for(let e of $e)if(t.includes(e.key))return{icon:e.icon,color:e.color};let n=0;for(let e=0;e<t.length;e++)n=(n<<5)-n+t.charCodeAt(e)|0;return et[Math.abs(n)%et.length]}function it(e){if(e==null||e===``)return``;if(e instanceof Date&&!isNaN(e.getTime()))return`${e.getFullYear()}-${W(e.getMonth()+1)}-${W(e.getDate())}`;let t=String(e).trim();if(!t)return``;if(/^-?\d+(\.\d+)?$/.test(t)){let e=parseFloat(t);if(e>0&&e<73e3){let t=Date.UTC(1899,11,30)+Math.round(e)*864e5,n=new Date(t);if(!isNaN(n.getTime()))return`${n.getUTCFullYear()}-${W(n.getUTCMonth()+1)}-${W(n.getUTCDate())}`}return``}let n=t.split(/[/\-.]/).map(e=>e.trim()).filter(Boolean);if(n.length===3){let e=n.findIndex(e=>/^\d{4}$/.test(e));if(e===-1)return``;let t=n[e],r=n.filter((t,n)=>n!==e).map(Number);if(r.some(e=>isNaN(e)))return``;let i,a;if(e===0)[i,a]=r;else{let[e,t]=r;e>12?(a=e,i=t):t>12?(a=t,i=e):(a=e,i=t)}return i<1||i>12||a<1||a>31?``:`${t}-${W(i)}-${W(a)}`}return``}function at(){let e=document.createElement(`div`);return e.innerHTML=`
        <h1>Upload Data</h1>
        <div class="card glass" style="border-color: rgba(33, 115, 70, 0.3); box-shadow: 0 0 15px rgba(33, 115, 70, 0.1);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                <h2 class="card-title" style="color: #217346; margin: 0;">Excel Upload</h2>
            </div>

            <!-- Format Selector -->
            <div style="margin-bottom: 20px;">
                <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:8px;">Import Format</label>
                <select id="formatSelect" class="glass-input" style="width:100%;">
                    ${(()=>{let e=b.savedFormats||[],t=b.trips.find(e=>e.id===b.activeTripId),n=t?.activeFormatId,r=t?.activeFormatType||`popular`;return`
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
            <div id="customFormatPreview" class="callout-tinted" style="display:none; margin-bottom: var(--space-4); --accent: 255,149,0;">
                <p class="callout-tinted__label">Active Format Mapping</p>
                <div id="customFormatTable"></div>
            </div>

            <!-- Popular format note -->
            <div id="popularNote" class="callout-tinted callout-tinted--lg" style="margin-bottom: var(--space-5); --accent: 0,113,227;">
                <span class="callout-tinted__label">💡 FORMAT PREVIEW</span>
                <p class="callout-tinted__body">Ensure your file contains these columns. We will try to auto-detect categories.</p>
                <div id="popularFormatTableContainer" style="margin-top: var(--space-4); overflow-x: auto; background: white; border-radius: var(--radius-sm); border: 1px solid rgba(0,0,0,0.05);"></div>
            </div>

            <div class="callout-tinted" style="margin-bottom: 15px; --accent: 0,113,227;">
                <p class="callout-tinted__label">📅 Date format</p>
                <p class="callout-tinted__body">Use <strong>DD-MM-YYYY</strong> (e.g. <code class="code-inline">15-03-2024</code>) or <strong>YYYY-MM-DD</strong>. Excel-typed date cells are recognised automatically.</p>
            </div>

            <div class="callout-tinted" style="margin-bottom: 15px; --accent: 52,199,89;">
                <p class="callout-tinted__label">⚖️ Splits &amp; settlements</p>
                <p class="callout-tinted__body">
                    <strong>Tricount / Splitwise</strong> rows are imported as equal-split shared expenses.
                    <strong>Revolut</strong> rows are imported as personal (no debt).
                    <strong>Custom formats</strong> can map two optional variables:
                    <code class="code-inline">splits</code> (e.g. <code class="code-inline">Alice:50,Bob:50</code>) to define percentages, and
                    <code class="code-inline">isSettlement</code> (Y/N) to mark a row as a transfer — receiver goes in the splits cell, e.g. <code class="code-inline">Bob:100</code>.
                    <br>By default, custom rows are <strong>regular expenses, never settlements</strong>: a row only counts as a settlement when <code class="code-inline">isSettlement</code> is mapped <em>and</em> its cell is Y/Yes/True/1. Without <code class="code-inline">splits</code>, the row is recorded as 100% paid by the payer (no debt created).
                </p>
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
    `,setTimeout(()=>{let t=null;e.querySelector(`#uploadFormatSettingsLink`)?.addEventListener(`click`,e=>{e.preventDefault(),q(`settings`),setTimeout(()=>ue(`format`),50)});let n=I(e,`#formatSelect`),r=I(e,`#popularNote`),i=I(e,`#customFormatPreview`),a=I(e,`#customFormatTable`),s=()=>{let t=n.value,o=t.startsWith(`popular:`);if(r.style.display=o?`block`:`none`,o){i.style.display=`none`;let n=t.split(`:`)[1],r=I(e,`#popularFormatTableContainer`),a=[],o=[];n===`tricount`?(a=[`Title`,`Amount`,`Currency`,`Date`,`Paid by`],o=[`Dinner`,`45.00`,`EUR`,`2023-10-12`,`Alice`]):n===`splitwise`?(a=[`Date`,`Description`,`Category`,`Cost`,`Currency`],o=[`2023-10-12`,`Taxi`,`Transportation`,`20.00`,`EUR`]):n===`revolut`&&(a=[`Type`,`Product`,`Started Date`,`Description`,`Amount`,`Currency`,`State`],o=[`CARD_PAYMENT`,`Current`,`2023-10-12`,`Restaurant`,`-45.00`,`EUR`,`COMPLETED`]),a.length>0?r.innerHTML=`
                        <table class="liquid-table" style="font-size: 0.75rem; margin: 0;">
                            <thead>
                                <tr>${a.map(e=>`<th style="padding: 8px 12px;">${e}</th>`).join(``)}</tr>
                            </thead>
                            <tbody>
                                <tr>${o.map(e=>`<td style="padding: 8px 12px; color: var(--text-secondary);">${e}</td>`).join(``)}</tr>
                            </tbody>
                        </table>
                    `:r.innerHTML=``;let s=b.trips.find(e=>e.id===b.activeTripId);s&&(s.activeFormatId=n,s.activeFormatType=`popular`,T(`state:changed`))}else{let e=t.split(`:`)[1],n=(b.savedFormats||[]).find(t=>t.id===e);if(n){i.style.display=`block`,a.innerHTML=`<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap:8px;">
                        ${n.mappings.map(e=>`<div style="font-size:0.75rem;"><span style="color:var(--text-secondary);">${e.variable}:</span> <strong>${e.column}</strong></div>`).join(``)}
                    </div>`;let t=b.trips.find(e=>e.id===b.activeTripId);t&&(t.activeFormatId=e,t.activeFormatType=`custom`,T(`state:changed`))}else i.style.display=`none`}};n.addEventListener(`change`,s),s(),I(e,`#excelFile`).addEventListener(`change`,n=>{let r=n.target.files?.[0];if(!r)return;let i=new FileReader;i.onload=function(n){try{let r=new Uint8Array(n.target?.result),i=XLSX.read(r,{type:`array`,cellDates:!0}),a=i.SheetNames[0],o=i.Sheets[a],s=XLSX.utils.sheet_to_json(o,{header:1});if(s.length<2)return;let c=s[0];t=s.slice(1).filter(e=>e.length>0&&e[0]);let l=I(e,`#previewContainer`),u=I(e,`#previewTable thead`),d=I(e,`#previewTable tbody`);u.innerHTML=`<tr>`+c.map(e=>`<th>${e||``}</th>`).join(``)+`</tr>`,d.innerHTML=t.slice(0,3).map(e=>`<tr>`+c.map((t,n)=>`<td>${e[n]||``}</td>`).join(``)+`</tr>`).join(``),l.style.display=`block`}catch(e){console.error(`Preview error`,e)}},i.readAsArrayBuffer(r)}),I(e,`#uploadBtn`).addEventListener(`click`,()=>{if(!b.activeTripId){alert(`Please select or create a trip first!`);return}let r=b.activeTripId,i=b.trips.find(e=>e.id===r);i&&!Array.isArray(i.companions)&&(i.companions=[]);let a=I(e,`#uploadStatus`),s=n.value,c=s.startsWith(`popular:`),l=s.split(`:`)[1];if(!t){a.innerText=`Please select a valid file to process.`,a.style.color=`red`;return}try{let n=0,u=[],d=[];if(!c){let e=s.split(`:`)[1],t=b.savedFormats.find(t=>t.id===e);if(!t)throw Error(`Format not found`);u=t.mappings}t.forEach(e=>{let t=``,a=``,s=``,f=``,p=``,m=0,g=`EUR`,_=null,y=!1;if(c)l===`tricount`?(s=String(e[0]||``).trim(),m=parseFloat(e[1])||0,g=String(e[2]||`EUR`).trim().toUpperCase(),f=it(e[3]),a=String(e[4]||``).trim(),t=String(e[5]||``).trim(),p=`Unknown`):l===`splitwise`&&(f=it(e[0]),s=String(e[1]||``).trim(),a=String(e[2]||``).trim(),m=parseFloat(e[3])||0,g=String(e[4]||`EUR`).trim().toUpperCase(),t=`Me`,p=`Unknown`);else{let n=e=>e?e.toUpperCase().charCodeAt(0)-65:-1,r=t=>{let r=u.find(e=>e.variable===t);return r?String(e[n(r.column)]||``).trim():``};t=r(`who`),a=r(`category`)||r(`categoryId`),s=r(`label`),f=it((t=>{let r=u.find(e=>e.variable===t);return r?e[n(r.column)]:null})(`date`)),p=r(`country`)||`Unknown`,m=parseFloat(r(`value`))||0,g=r(`currency`).toUpperCase()||`EUR`,_=tt(r(`splits`)),y=nt(r(`isSettlement`))}if(t&&i&&v(i,t),_&&i)for(let e of Object.keys(_))e&&v(i,e);if(!_){let e=i?h(i):[];if(c&&(l===`tricount`||l===`splitwise`)&&e.length>0){let t=100/e.length;_={},e.forEach(e=>{_[e]=t})}else _=t?{[t]:100}:{}}let x=b.categories.find(e=>e.name.toLowerCase()===a.toLowerCase());if(!x&&a){let e=rt(a);x={id:F(),name:a,icon:e.icon,color:e.color},b.categories.push(x)}let S=x?x.id:b.categories[0].id,C={id:F(),tripId:r,who:t,categoryId:S,label:y&&!s?`Settlement: ${t} → ${Object.keys(_)[0]||``}`:s,date:f,country:p,value:m,currency:g,euroValue:m*(o[g]||1),splits:_};y&&(C.isSettlement=!0),b.expenses.push(C),d.push(C.id),n++}),d.length>0&&(b.lastImportBatch={tripId:r,expenseIds:d,importedAt:new Date().toISOString()}),T(`state:changed`),X(),a.innerText=`Successfully imported ${n} expenses!`,a.style.color=`green`,t=null,I(e,`#previewContainer`).style.display=`none`}catch(e){console.error(e),a.innerText=`Error parsing file. Check the format.`,a.style.color=`red`}})},0),e}var G=`manual`;function ot(e){G=e}var st=e=>{let t=b.expenses.find(t=>t.id===e);t&&(b.draftExpense={...t},b.activeTripId=t.tripId,G=`manual`,T(`state:changed`),q(`expenses`))},ct=e=>{P({title:`Delete Expense?`,message:`This action cannot be undone.`,confirmText:`Delete`,onConfirm:()=>{b.expenses=b.expenses.filter(t=>t.id!==e),T(`state:changed`),Kt(e),G=`history`,q(`expenses`)}})};function lt(){let e=document.createElement(`div`);if(!b.activeTripId)return e.innerHTML=`<h1 style="display: inline-block; background: linear-gradient(135deg, var(--accent-blue), #9b59b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Expenses</h1><div class="card glass"><p>Please select a trip first.</p></div>`,e;e.innerHTML=`
        <h1 style="display: inline-block; background: linear-gradient(135deg, var(--accent-blue), #9b59b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 12px;">Expenses</h1>
        <nav class="expenses-tabnav" role="tablist">
            <button class="expenses-tabnav__tab" data-tab="manual" role="tab">Manual Upload</button>
            <button class="expenses-tabnav__tab" data-tab="batch" role="tab">Batch Upload</button>
            <button class="expenses-tabnav__tab" data-tab="history" role="tab">History</button>
        </nav>
        <div id="expensesTabContent"></div>
    `;let t=()=>{let t=I(e,`#expensesTabContent`);t.innerHTML=``,e.querySelectorAll(`.expenses-tabnav__tab`).forEach(e=>{let t=e;t.classList.toggle(`is-active`,t.dataset.tab===G)});let r=!be(b.trips.find(e=>e.id===b.activeTripId));G===`manual`?t.appendChild(r?n(`Manual Upload`,`log new expenses`):ut()):G===`batch`?t.appendChild(r?n(`Batch Upload`,`import expenses`):at()):t.appendChild(dt())};function n(e,t){let n=document.createElement(`div`);return n.innerHTML=`
            <div class="card glass" style="max-width: 520px; margin: 32px auto; padding: 36px; border-radius: 28px; text-align: center; background: rgba(255,255,255,0.6);">
                <div style="font-size: 2.4rem; margin-bottom: 12px;">👁</div>
                <h2 style="margin: 0 0 12px; font-size: 1.4rem; font-weight: 800; color: #002d5b; letter-spacing: -0.02em;">Read-only — Relaxer view</h2>
                <p style="margin: 0; color: rgba(0,0,0,0.55); line-height: 1.5;">
                    You're a <strong>Relaxer</strong> on this trip, so you can't ${t} from the <strong>${e}</strong> tab. Switch to the <strong>History</strong> tab to see what's been added — and ask the trip's planner to promote you if you want to contribute.
                </p>
            </div>
        `,n}return e.querySelectorAll(`.expenses-tabnav__tab`).forEach(e=>{let n=e;n.addEventListener(`click`,()=>{let e=n.dataset.tab;(e===`manual`||e===`batch`||e===`history`)&&(G=e,t())})}),setTimeout(t,0),e}function ut(){let e=document.createElement(`div`),t=(b.trips.find(e=>e.id===b.activeTripId)?.companions??[]).map(e=>e.name),n=t.length>0,i=t.map(e=>`<option value="${e}">${e}</option>`).join(``);i||=`<option value="">No companions on this trip — add some from Home</option>`;let a=b.categories.map(e=>`<option value="${e.id}">${e.icon} ${e.name}</option>`).join(``);return e.innerHTML=`
        <div class="card glass" style="max-width: 600px; margin: 0 auto; width: 100%; border-radius: 44px; border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.15); backdrop-filter: blur(25px); padding: 48px; box-shadow: 0 40px 100px rgba(0,0,0,0.25);">
            <h2 class="card-title" style="font-size: 2.2rem; margin-bottom: 32px; color: #000000; letter-spacing: -0.06em; font-weight: 800; text-align: center;">Add Expense</h2>
            <form id="expenseForm" style="display: flex; flex-direction: column; align-items: center; width: 100%;">

                <div class="form-row">
                    <label class="form-label-light">Who Paid</label>
                    <select id="expWho" class="glass-input-light" required>
                        ${i}
                    </select>
                    ${n?``:`
                    <div id="addCompanionsHelper" style="margin-top: var(--space-3); font-size: var(--font-sm); color: var(--accent-blue); font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        <span>➕</span> <span style="text-decoration: underline;">Add companions to this trip from Home</span>
                    </div>`}
                </div>

                <div class="form-row">
                    <label class="form-label-light">Category</label>
                    <select id="expCategory" class="glass-input-light" required>
                        ${a}
                    </select>
                </div>

                <div class="form-row">
                    <label class="form-label-light">Label</label>
                    <input type="text" id="expLabel" class="glass-input-light" placeholder="e.g. Dinner at Mario's" required>
                </div>

                <div class="form-row">
                    <label class="form-label-light">Date</label>
                    <input type="date" id="expDate" class="glass-input-light" required>
                </div>

                <div class="form-row" style="position: relative;" id="countrySearchContainer">
                    <label class="form-label-light">Country</label>
                    <div class="custom-select-wrapper">
                        <input type="text" id="expCountry" class="glass-input-light" placeholder="Search country..." autocomplete="off">
                        <div id="countryDropdownList" class="custom-select-dropdown glass shadow-xl" style="display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 1000; max-height: 250px; overflow-y: auto; margin-top: var(--space-2); border-radius: var(--radius-xl); border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.95); backdrop-filter: blur(20px);">
                            ${r.sort().map(e=>`<div class="dropdown-item" data-value="${e}">${e}</div>`).join(``)}
                            <div class="dropdown-item" data-value="Other">Other</div>
                        </div>
                    </div>
                </div>

                <div class="form-row">
                    <label class="form-label-light">Value</label>
                    <input type="number" step="0.01" id="expValue" class="glass-input-light" style="font-weight: 700;" required>
                </div>

                <div class="form-row" style="margin-bottom: var(--space-8);">
                    <label class="form-label-light">Currency</label>
                    <select id="expCurrency" class="glass-input-light" required>
                        <option value="">Select Currency...</option>
                        ${Object.keys(o).map(e=>`<option value="${e}">${e}</option>`).join(``)}
                    </select>
                </div>

                <div style="margin-bottom: 40px; background: rgba(0,0,0,0.03); padding: 32px; border-radius: 32px; border: 1px solid rgba(0,0,0,0.05); width: 100%; max-width: 440px; box-sizing: border-box;">
                    <label style="display: block; margin-bottom: 16px; font-size: 0.9rem; font-weight: 800; color: #000000; letter-spacing: -0.02em;">Split Between</label>
                    <div style="display: flex; gap: 14px; margin-bottom: 20px;">
                        <select id="addSplitSelect" class="glass-input" style="flex: 1; padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.4); color: #000000; font-weight: 600; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;" ${n?``:`disabled`}>
                            <option value="">${n?`Add person to split...`:`No trip companions yet`}</option>
                            ${t.map(e=>`<option value="${e}">${e}</option>`).join(``)}
                        </select>
                        <button type="button" id="addSplitBtn" class="btn btn-small" style="padding: 0 24px; height: 50px; border-radius: 16px; background: #0071e3; color: #ffffff; font-weight: 700;">+ Add</button>
                    </div>
                    <div id="splitContainer" style="display: flex; flex-direction: column; gap: 12px;">
                        <!-- Dynamic splitters appear here -->
                    </div>
                </div>
                <button type="submit" class="btn-primary btn-primary--lg">Save Expense</button>
                <div id="manualSaveStatus" style="margin-top: 16px; font-weight: 700; text-align: center;"></div>
            </form>
        </div>
    `,setTimeout(()=>{e.querySelector(`#addCompanionsHelper`)?.addEventListener(`click`,()=>{q(`home`)});let t=I(e,`#expenseForm`),n=I(e,`#splitContainer`),r=I(e,`#addSplitSelect`),i=I(e,`#addSplitBtn`),a=[];function s(){if(a.length===0){n.innerHTML=`<p style="color:var(--text-secondary); font-size:0.85rem; padding:10px; border:1px dashed var(--glass-border); border-radius:8px; text-align:center;">100% will be attributed to the payer.</p>`;return}let e=(100/a.length).toFixed(1);n.innerHTML=a.map(t=>`
                <div class="splitter-row">
                    <span style="font-weight: 500;">${t}</span>
                    <div style="display: flex; align-items: center; gap: var(--space-2);">
                        <input type="number" class="glass-input split-input splitter-row__pct" data-person="${t}" value="${e}" step="0.1" required>
                        <span style="color: var(--text-secondary); font-size: var(--font-base);">%</span>
                        <button type="button" class="btn-x-bare remove-splitter" data-person="${t}" aria-label="Remove ${L(t)}" style="font-weight:700; margin-left: var(--space-2);">&times;</button>
                    </div>
                </div>
            `).join(``),n.querySelectorAll(`.remove-splitter`).forEach(e=>{e.onclick=()=>{let t=e.getAttribute(`data-person`);a=a.filter(e=>e!==t),s()}})}if(i.onclick=()=>{let e=r.value;e&&!a.includes(e)&&(a.push(e),s())},b.draftExpense){let t=b.draftExpense;t.who&&(I(e,`#expWho`).value=t.who),t.categoryId&&(I(e,`#expCategory`).value=t.categoryId),t.label&&(I(e,`#expLabel`).value=t.label),t.date&&(I(e,`#expDate`).value=t.date),t.country&&(I(e,`#expCountry`).value=t.country),t.value&&(I(e,`#expValue`).value=String(t.value)),t.currency&&(I(e,`#expCurrency`).value=t.currency)}t.querySelectorAll(`input, select`).forEach(e=>{e.addEventListener(`input`,e=>{let t=e.target,n=t.id;if(!n)return;let r=t.value;n===`expWho`&&(b.draftExpense.who=r),n===`expCategory`&&(b.draftExpense.categoryId=r),n===`expLabel`&&(b.draftExpense.label=r),n===`expDate`&&(b.draftExpense.date=r),n===`expCountry`&&(b.draftExpense.country=r),n===`expValue`&&(b.draftExpense.value=r),n===`expCurrency`&&(b.draftExpense.currency=r),T(`state:changed`)})});let c=I(e,`#expCountry`),l=I(e,`#countryDropdownList`),u=l.querySelectorAll(`.dropdown-item`);c.onfocus=()=>{l.style.display=`block`},c.oninput=e=>{let t=e.target.value.toLowerCase();u.forEach(e=>{let n=(e.textContent??``).toLowerCase();e.style.display=n.includes(t)?`block`:`none`}),l.style.display=`block`};let d=e=>{c.value=e.getAttribute(`data-value`)??``,l.style.display=`none`,b.draftExpense.country=c.value,T(`state:changed`)};u.forEach(e=>{e.onclick=t=>{d(e),t.stopPropagation()}});let f=-1,p=()=>Array.from(u).filter(e=>e.style.display!==`none`),m=()=>{u.forEach(e=>e.classList.remove(`is-active`)),f=-1},h=e=>{let t=p();if(t.length===0){m();return}u.forEach(e=>e.classList.remove(`is-active`)),f=(e%t.length+t.length)%t.length,t[f].classList.add(`is-active`),t[f].scrollIntoView({block:`nearest`})};c.addEventListener(`keydown`,e=>{if(l.style.display===`none`&&(e.key===`ArrowDown`||e.key===`ArrowUp`)&&(l.style.display=`block`),e.key===`ArrowDown`){e.preventDefault(),h(f+1);return}if(e.key===`ArrowUp`){e.preventDefault(),h(f-1);return}if(e.key===`Enter`){let t=p();f>=0&&t[f]&&(e.preventDefault(),d(t[f]),m());return}if(e.key===`Escape`){l.style.display=`none`,m();return}}),c.addEventListener(`input`,m),document.addEventListener(`click`,t=>{let n=t.target,r=e.querySelector(`#countrySearchContainer`);(!n||!r||!r.contains(n))&&(l.style.display=`none`)}),t.addEventListener(`submit`,n=>{if(n.preventDefault(),!b.activeTripId)return;let r=b.activeTripId,i=I(e,`#expWho`).value,c={},l=0,u=e.querySelectorAll(`.split-input`);if(u.length>0){if(u.forEach(e=>{let t=parseFloat(e.value)||0,n=e.getAttribute(`data-person`);n&&(c[n]=t),l+=t}),Math.abs(l-100)>.5){alert(`Percentages must add up to exactly 100%`);return}}else c[i]=100;let d=parseFloat(I(e,`#expValue`).value),f=I(e,`#expCurrency`).value.toUpperCase();if(isNaN(d)||d<=0){alert(`Please enter a valid expense value.`);return}if(!f){alert(`Please select a currency.`);return}let p=b.trips.find(e=>e.id===r),m=I(e,`#expCountry`).value||(p?p.country:``),h=!!b.draftExpense?.id,g={id:h&&b.draftExpense.id?b.draftExpense.id:F(),tripId:r,who:i,categoryId:I(e,`#expCategory`).value,label:I(e,`#expLabel`).value,date:I(e,`#expDate`).value,country:m,value:d,currency:f,euroValue:d*(o[f]||1),splits:c};if(h){let e=b.expenses.findIndex(e=>e.id===g.id);e===-1?b.expenses.push(g):b.expenses[e]=g}else b.expenses.push(g);b.draftExpense={who:``,categoryId:``,label:``,date:``,country:``,value:``,currency:`EUR`,euroValue:``},T(`state:changed`),Gt(g);let _=I(e,`#manualSaveStatus`);_.textContent=h?`✓ Expense updated — view in History`:`✓ Expense saved — view in History`,_.style.color=`#34c759`,setTimeout(()=>{_.textContent=``},4e3),t.reset(),a=[],s()}),s()},0),e}function dt(){let e=document.createElement(`div`),t=(b.trips.find(e=>e.id===b.activeTripId)?.companions??[]).map(e=>e.name),n=t.length>0?t:Array.from(new Set(b.expenses.filter(e=>e.tripId===b.activeTripId).map(e=>e.who).filter(Boolean))),r=b.lastImportBatch;return e.innerHTML=`
        <div id="expensesContainer" style="max-width: 1000px; margin: 0 auto; width: 100%; margin-bottom: 60px;">
            <div style="margin-bottom: 40px; padding: 0 10px;">
                <div class="card glass" style="padding: 32px; border-radius: 32px; background: linear-gradient(135deg, rgba(255,255,255,0.4), rgba(255,255,255,0.1)); border: 1px solid rgba(255,255,255,0.5); box-shadow: 0 20px 50px rgba(0,0,0,0.05);">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
                        <h2 style="font-size: 1.8rem; font-weight: 800; letter-spacing: -0.04em; margin: 0;">Expense History</h2>
                        <div style="display: flex; gap: 8px;">
                            ${r&&r.tripId===b.activeTripId&&Array.isArray(r.expenseIds)&&r.expenseIds.length>0?`<button id="undoLastBatchBtn" class="btn-chip-danger" title="Remove the ${r.expenseIds.length} expenses just imported">↶ Undo last batch (${r.expenseIds.length})</button>`:``}
                            <button id="clearFiltersBtn" class="btn-chip-danger">Clear Filters</button>
                            <span style="font-size: 0.75rem; font-weight: 700; color: var(--accent-blue); background: rgba(0,113,227,0.1); padding: 6px 14px; border-radius: 100px; text-transform: uppercase;">Smart Filters</span>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-3);">
                        <!-- Row 1: Search (full width) -->
                        <div style="grid-column: 1 / -1;">
                            <label class="filter-label">Search</label>
                            <input type="text" id="filterSearch" class="filter-input" placeholder="Search labels or items...">
                        </div>

                        <!-- Row 2: Category | Payer | Sort -->
                        <div>
                            <label class="filter-label">Category</label>
                            <select id="filterCategory" class="filter-input">
                                <option value="all">All Categories</option>
                                ${b.categories.map(e=>`<option value="${e.id}">${e.icon} ${e.name}</option>`).join(``)}
                                <option value="settlement">🤝 Settlement</option>
                            </select>
                        </div>
                        <div>
                            <label class="filter-label">Payer</label>
                            <select id="filterWho" class="filter-input">
                                <option value="all">Everyone</option>
                                ${n.map(e=>`<option value="${e}">${e}</option>`).join(``)}
                            </select>
                        </div>
                        <div>
                            <label class="filter-label">Sort By</label>
                            <select id="filterSort" class="filter-input">
                                <option value="date_desc">Newest first</option>
                                <option value="date_asc">Oldest first</option>
                                <option value="value_desc">Highest amount</option>
                                <option value="value_asc">Lowest amount</option>
                                <option value="label_asc">Label (A–Z)</option>
                                <option value="who_asc">Payer (A–Z)</option>
                            </select>
                        </div>

                        <!-- Row 3: From Date | To Date | Min–Max Value -->
                        <div>
                            <label class="filter-label">From Date</label>
                            <input type="date" id="filterDateFrom" class="filter-input">
                        </div>
                        <div>
                            <label class="filter-label">To Date</label>
                            <input type="date" id="filterDateTo" class="filter-input">
                        </div>
                        <div>
                            <label class="filter-label">Value Range (€)</label>
                            <div style="display: flex; gap: var(--space-2); align-items: center;">
                                <input type="number" id="filterMinVal" class="filter-input" placeholder="Min" style="flex: 1; padding: var(--space-3);">
                                <span style="color: rgba(0,0,0,0.3); font-weight: 700; flex-shrink: 0;">–</span>
                                <input type="number" id="filterMaxVal" class="filter-input" placeholder="Max" style="flex: 1; padding: var(--space-3);">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div id="tripExpensesList" style="display: flex; flex-direction: column; gap: 20px;"></div>
        </div>
    `,e.addEventListener(`click`,e=>{let t=e.target;if(!t)return;let n=t.closest(`.expense-edit-btn`);if(n?.dataset.expenseId){st(n.dataset.expenseId);return}let r=t.closest(`.expense-delete-btn`);if(r?.dataset.expenseId){ct(r.dataset.expenseId);return}}),setTimeout(()=>{let t=()=>{let t=I(e,`#filterSearch`).value.toLowerCase(),n=I(e,`#filterCategory`).value,r=I(e,`#filterWho`).value,i=I(e,`#filterDateFrom`).value,a=I(e,`#filterDateTo`).value,o=parseFloat(I(e,`#filterMinVal`).value)||0,s=parseFloat(I(e,`#filterMaxVal`).value)||1/0,c=I(e,`#filterSort`).value;ft(I(e,`#tripExpensesList`),{search:t,catId:n,who:r,dateFrom:i,dateTo:a,minVal:o,maxVal:s,sort:c})};I(e,`#filterSearch`).oninput=t,I(e,`#filterCategory`).onchange=t,I(e,`#filterWho`).onchange=t,I(e,`#filterSort`).onchange=t,I(e,`#filterDateFrom`).onchange=t,I(e,`#filterDateTo`).onchange=t,I(e,`#filterMinVal`).oninput=t,I(e,`#filterMaxVal`).oninput=t,I(e,`#clearFiltersBtn`).onclick=()=>{I(e,`#filterSearch`).value=``,I(e,`#filterCategory`).value=`all`,I(e,`#filterWho`).value=`all`,I(e,`#filterSort`).value=`date_desc`,I(e,`#filterDateFrom`).value=``,I(e,`#filterDateTo`).value=``,I(e,`#filterMinVal`).value=``,I(e,`#filterMaxVal`).value=``,ft(I(e,`#tripExpensesList`))};let n=e.querySelector(`#undoLastBatchBtn`);n&&(n.onclick=()=>{let e=b.lastImportBatch;!e||!Array.isArray(e.expenseIds)||e.expenseIds.length===0||P({title:`Undo last batch?`,message:`Removes the ${e.expenseIds.length} expenses imported in your most recent upload. This cannot be undone.`,confirmText:`Undo batch`,onConfirm:()=>{let t=new Set(e.expenseIds);b.expenses=b.expenses.filter(e=>!t.has(e.id)),b.lastImportBatch=null,T(`state:changed`),t.forEach(e=>Kt(e)),q(`expenses`)}})}),ft(I(e,`#tripExpensesList`))},0),e}function ft(e,t={}){if(!e)return;let n=b.expenses.filter(e=>e.tripId===b.activeTripId),r=t.search;r&&(n=n.filter(e=>e.label.toLowerCase().includes(r))),n=t.catId&&t.catId!==`all`?t.catId===`settlement`?n.filter(e=>e.isSettlement):n.filter(e=>e.categoryId===t.catId&&!e.isSettlement):n.filter(e=>!e.isSettlement),t.who&&t.who!==`all`&&(n=n.filter(e=>e.who===t.who));let{dateFrom:i,dateTo:a,minVal:o,maxVal:s}=t;switch(i&&(n=n.filter(e=>e.date>=i)),a&&(n=n.filter(e=>e.date<=a)),o!==void 0&&(n=n.filter(e=>(e.euroValue||0)>=o)),s!==void 0&&s!==1/0&&(n=n.filter(e=>(e.euroValue||0)<=s)),t.sort||`date_desc`){case`date_asc`:n.sort((e,t)=>new Date(e.date).getTime()-new Date(t.date).getTime());break;case`value_desc`:n.sort((e,t)=>(t.euroValue||0)-(e.euroValue||0));break;case`value_asc`:n.sort((e,t)=>(e.euroValue||0)-(t.euroValue||0));break;case`label_asc`:n.sort((e,t)=>(e.label||``).localeCompare(t.label||``));break;case`who_asc`:n.sort((e,t)=>(e.who||``).localeCompare(t.who||``));break;default:n.sort((e,t)=>new Date(t.date).getTime()-new Date(e.date).getTime());break}function c(e){if(!e)return`Global`;let t=new Date(e+`T00:00:00Z`);return isNaN(t.getTime())?`Global`:`${String(t.getUTCDate()).padStart(2,`0`)}-${String(t.getUTCMonth()+1).padStart(2,`0`)}-${t.getUTCFullYear()}`}if(n.length===0){e.innerHTML=`
            <div class="card glass expense-row__empty">
                <div style="font-size: 2.5rem; margin-bottom: 15px; opacity: 0.5;">💸</div>
                <p style="color: rgba(255,255,255,0.5); font-weight: 500; font-size: var(--font-lg);">No expenses found for this trip.</p>
            </div>
        `;return}let l=k(),u=be(b.trips.find(e=>e.id===b.activeTripId));e.innerHTML=n.map(e=>{let t=b.categories.find(t=>t.id===e.categoryId),n=e.currency===l?``:`≈ ${j(e.value,e.currency)}`;return`
            <div class="card glass expense-row" style="padding: 14px 22px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.15); backdrop-filter: blur(25px); display: flex; justify-content: space-between; align-items: center; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
                <div style="display: flex; align-items: center; gap: var(--space-4);">
                    <div class="expense-row__icon">
                        ${t?t.icon:`💰`}
                    </div>
                    <div>
                        <strong class="expense-row__title">${L(e.label)}</strong>
                        <div class="expense-row__meta">
                            <span>${c(e.date)}</span>
                            <span class="expense-row__meta-dot"></span>
                            <span>${L(e.country||`Global`)}</span>
                            <span class="expense-row__meta-dot"></span>
                            <span>${L(e.who)}</span>
                        </div>
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: var(--space-3);">
                    <div style="text-align: right;">
                        <div class="expense-row__amount">${e.value.toLocaleString(void 0,{minimumFractionDigits:2,maximumFractionDigits:2})} <span class="expense-row__currency">${L(e.currency)}</span></div>
                        ${n?`<div class="expense-row__converted">${n}</div>`:``}
                    </div>

                    ${u?`
                    <div style="display: flex; gap: var(--space-2);">
                        <button class="icon-action-btn expense-edit-btn" data-expense-id="${e.id}" aria-label="Edit expense" style="--accent: 0,113,227;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z"></path></svg>
                        </button>
                        <button class="icon-action-btn expense-delete-btn" data-expense-id="${e.id}" aria-label="Delete expense" style="--accent: 255,59,48;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                    `:``}
                </div>
            </div>
        `}).join(``)}function pt(){let e=document.createElement(`div`);if(!b.activeTripId)return e.innerHTML=`<h1 style="display: inline-block; background: linear-gradient(135deg, var(--accent-blue), #9b59b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Insights</h1><div class="card glass"><p>Please select a trip.</p></div>`,e;let t=b.expenses.filter(e=>e.tripId===b.activeTripId&&!e.isSettlement);if(tn([...new Set(t.map(e=>e.date).filter(e=>!!e))]).then(()=>{}),t.length===0)return e.innerHTML=`
            <h1 style="display: inline-block; background: linear-gradient(135deg, var(--accent-blue), #9b59b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Insights</h1>
            <div style="height: 60vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: var(--text-secondary);">
                <div style="font-size: 5rem; margin-bottom: 20px; opacity: 0.5;">📊</div>
                <h2 style="color: var(--text-primary); margin-bottom: 10px;">No Data to Analyze Yet</h2>
                <p style="max-width: 400px; line-height: 1.5;">Add your travel expenses in the <b>Expenses</b> tab or upload an Excel sheet to see your spending breakdown and analytics.</p>
                <button id="goToExpensesBtn" class="btn" style="margin-top: 24px;">Add Your First Expense</button>
            </div>
        `,setTimeout(()=>{e.querySelector(`#goToExpensesBtn`)?.addEventListener(`click`,()=>q(`expenses`))},0),e;let n=b.insightCurrency||k(),r=te(n),i=b.rateMode||`at_trip`,a=t.map(e=>{let t=o[e.currency]||1;if(i===`at_trip`){let n=`${e.date}_${e.currency}_EUR`;b.rateCache&&b.rateCache[n]&&(t=b.rateCache[n])}let r=e.euroValue||e.value*t,a=r;if(n!==`EUR`){let t=1/(o[n]||1);if(i===`at_trip`){let r=`${e.date}_${n}_EUR`;b.rateCache&&b.rateCache[r]&&(t=1/b.rateCache[r])}a=r*t}return{...e,displayValue:a}}),s=a.reduce((e,t)=>e+t.displayValue,0),c=a.length,l=null;a.length>0&&(l=a.reduce((e,t)=>t.displayValue>e.displayValue?t:e,a[0]));let u={},d={},f={};a.forEach(e=>{d[e.categoryId]||(d[e.categoryId]=0),d[e.categoryId]+=e.displayValue,u[e.who]||(u[e.who]=0),u[e.who]+=e.displayValue;let t=e.date||`Unknown`;f[t]||(f[t]=0),f[t]+=e.displayValue});let p=Object.entries(u).sort((e,t)=>t[1]-e[1]).slice(0,10),m=p.length>0?p[0][0]:`N/A`,h=p.length>0?p[0][1]:0,g=p.slice(1).map(([e,t],n)=>`
        <div class="ranking-row">
            <span class="ranking-row__label">${n+2}. ${e}</span>
            <span class="ranking-row__value">${r}${t.toFixed(2)}</span>
        </div>
    `).join(``),_={};t.forEach(e=>{_[e.categoryId]=(_[e.categoryId]||0)+1});let v=Object.entries(_).sort((e,t)=>t[1]-e[1]).slice(0,10),y=v.length>0?v[0][0]:null,x=y?b.categories.find(e=>e.id===y):null;x&&x.icon+``+x.name;let S=v.slice(1).map(([e,t],n)=>{let r=b.categories.find(t=>t.id===e);return`
            <div class="ranking-row">
                <span class="ranking-row__label">${n+2}. ${r?r.icon+` `+r.name:`Unknown`}</span>
                <span class="ranking-row__value">${t} trans.</span>
            </div>
        `}).join(``),C=[],w=[],E=[];return Object.keys(d).forEach(e=>{let t=b.categories.find(t=>t.id===e);t?(C.push(t.icon+` `+t.name),E.push(t.color)):(C.push(`Unknown`),E.push(`#ccc`)),w.push(d[e])}),e.innerHTML=`
        <!-- Header Section -->
        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 20px; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 1px solid var(--glass-border);">
            <div>
                <h1 style="display: inline-block; background: linear-gradient(135deg, var(--accent-blue), #9b59b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin: 0; font-size: 3.5rem; letter-spacing: -0.04em;">Insights</h1>
                <p style="color: var(--text-secondary); margin: 8px 0 0 0; font-size: 1.1rem;">Your travel spending at a glance.</p>
            </div>
            <div style="display: flex; align-items: center; gap: 24px;">
                <div class="glass" style="display: flex; padding: 4px; border-radius: 14px; border: 1px solid var(--glass-border); box-shadow: var(--shadow-sm);">
                    <button class="toggle-btn rate-mode-btn ${i===`at_trip`?`active`:``}" data-mode="at_trip">
                        At Trip
                    </button>
                    <button class="toggle-btn rate-mode-btn ${i===`today`?`active`:``}" data-mode="today">
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
        <div style="margin-bottom: var(--space-8);">
            <div class="card glass hero-stat-card">
                <h2 class="card-title hero-stat-card__title">Total Spent on your trip</h2>
                <div style="display: flex; align-items: baseline; gap: var(--space-3);">
                    <h1 class="hero-stat-card__value">${r}${s.toFixed(2)}</h1>
                    <span class="hero-stat-card__currency">${n}</span>
                </div>
                <p class="hero-stat-card__sub">Spent across <strong>${c}</strong> transactions during your travels.</p>
            </div>
        </div>

        <!-- Summary Grid -->
        <div class="grid-2" style="grid-template-columns: 1fr 1fr; margin-bottom: var(--space-8);">
            <div class="card glass">
                <h2 class="card-title metric-label">Avg. Daily Spend</h2>
                <h1 class="metric-value">${r}${(s/(Object.keys(f).length||1)).toFixed(2)}<small style="font-size: var(--font-lg); font-weight: 400; color: var(--text-secondary); margin-left: var(--space-2);">/ day</small></h1>
            </div>
            ${l?`
            <div class="card glass">
                <h2 class="card-title metric-label">Single Peak</h2>
                <h1 class="metric-value" style="color: #ff3b30;">${r}${l.displayValue.toFixed(2)}</h1>
                <p class="metric-label" style="margin: var(--space-1) 0 0 0;">${l.label} • ${l.who}</p>
            </div>
            `:``}
        </div>

        <!-- Rankings Grid -->
        <div class="grid-2" style="margin-bottom: 32px;">
            <div class="card glass" style="padding: 28px;">
                <h2 class="card-title">Top Spenders</h2>
                <div style="margin-bottom: 20px;">
                    <h1 style="margin: 0; font-size: 2rem; color: var(--text-primary);">${m}</h1>
                    <span style="color: var(--accent-blue); font-weight: 700; font-size: 1.1rem;">${s>0?r+h.toFixed(2):`0`}</span>
                </div>
                <div style="margin-top: 20px; display: flex; flex-direction: column; gap: 4px;">
                    ${g}
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
    `,setTimeout(()=>{e.querySelectorAll(`.rate-mode-btn`).forEach(e=>{let t=e;t.addEventListener(`click`,()=>{let e=t.dataset.mode;(e===`at_trip`||e===`today`)&&(b.rateMode=e),T(`state:changed`),q(`insights`)})}),e.querySelector(`#insightCurrencySelector`)?.addEventListener(`change`,e=>{b.insightCurrency=e.target.value,T(`state:changed`),q(`insights`)});let i=e.querySelector(`#categoryChart`);i&&w.length>0&&new Chart(i,{type:`doughnut`,data:{labels:C,datasets:[{data:w,backgroundColor:E,borderWidth:0}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{position:`right`}}}});let a=e.querySelector(`#timelineChart`);if(a&&t.length>0){let e=Object.keys(f).sort(),t=e.map(e=>f[e]),i=e.map(e=>{try{return new Date(e).toLocaleDateString(`en-US`,{month:`short`,day:`numeric`})}catch{return e}});new Chart(a,{type:`line`,data:{labels:i,datasets:[{label:n+` Spent`,data:t,borderColor:`#0071e3`,backgroundColor:`rgba(0, 113, 227, 0.1)`,fill:!0,tension:.4,pointRadius:4,pointBackgroundColor:`#0071e3`,borderWidth:3}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{display:!1},ticks:{maxRotation:0,autoSkip:!0,maxTicksLimit:7}},y:{beginAtZero:!0,grid:{color:`rgba(255,255,255,0.05)`},ticks:{maxTicksLimit:5,callback:e=>r+e}}}}})}},0),e}var mt=e=>{b.budgets=b.budgets.filter(t=>t.id!==e),T(`state:changed`),Xt(e),q(`budgets`)};function ht(){let e=document.createElement(`div`);b.budgets=b.budgets||[];let t=b.trips.map(e=>`<option value="${e.id}">${e.name}</option>`).join(``),n=b.categories.map(e=>`<option value="${e.id}">${e.name}</option>`).join(``),r=Array.from(new Set(b.trips.flatMap(e=>h(e)))).map(e=>`<option value="${e}">${e}</option>`).join(``),i=b.budgets.length>0?b.budgets.map(e=>{let t=0;b.expenses.forEach(n=>{n.isSettlement||e.tripId&&e.tripId!==`all`&&n.tripId!==e.tripId||e.categoryId&&e.categoryId!==`all`&&n.categoryId!==e.categoryId||e.user&&e.user!==`all`&&n.who!==e.user||(t+=n.euroValue||0)});let n=Math.min(t/e.amount*100,100),r=t>e.amount,i=!r&&n>80,a=`On Track`,o=`#34c759`;r?(a=`Over Budget`,o=`#ff3b30`):i&&(a=`Near Limit`,o=`#ff9500`);let s=b.categories.find(t=>t.id===e.categoryId),c=s?s.icon:`💰`,l=[];return e.tripId&&e.tripId!==`all`&&l.push(b.trips.find(t=>t.id===e.tripId)?.name||`Trip`),e.categoryId&&e.categoryId!==`all`&&l.push(s?.name||`Category`),e.user&&e.user!==`all`&&l.push(e.user),`
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
                        ${j(t,`EUR`)} <span style="color: var(--text-secondary); opacity: 0.6;">/ ${j(e.amount,`EUR`)}</span>
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
            <h1 class="gradient-text" style="--g-from: #ffd60a; --g-to: #ff9f0a;">Budgets</h1>
            <p>Set spending limits and track them across trips.</p>
        </div>
        
        <div class="grid-2" style="margin-top: 24px;">
            <div class="card glass card-glow-blue">
                <h2 class="card-title" style="color: var(--accent-blue);">Create New Budget</h2>
                <div class="compact-form-row">
                    <label class="compact-form-label">Trip</label>
                    <select id="budTrip" class="glass-input" style="width:100%;"><option value="all">All Trips</option>${t}</select>
                </div>
                <div class="compact-form-row">
                    <label class="compact-form-label">Category</label>
                    <select id="budCat" class="glass-input" style="width:100%;"><option value="all">All Categories</option>${n}</select>
                </div>
                <div class="compact-form-row">
                    <label class="compact-form-label">Person</label>
                    <select id="budUser" class="glass-input" style="width:100%;"><option value="all">Everyone</option>${r}</select>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 100px; gap: var(--space-3); margin-bottom: var(--space-4);">
                    <div>
                        <label class="compact-form-label">Target Amount</label>
                        <input type="number" id="budAmt" class="glass-input" style="width:100%;" placeholder="e.g. 1000">
                    </div>
                    <div>
                        <label class="compact-form-label">Currency</label>
                        <select id="budCurr" class="glass-input" style="width:100%;">
                            ${Object.keys(o).map(e=>`<option value="${e}" ${k()===e?`selected`:``}>${e}</option>`).join(``)}
                        </select>
                    </div>
                </div>
                <button id="saveBudgetBtn" class="btn-primary" style="width:100%;">Save Budget</button>
            </div>
            
            <div class="card glass card-glow-blue">
                <h2 class="card-title">Active Tracking</h2>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${i}
                </div>
            </div>
        </div>
    `,setTimeout(()=>{e.addEventListener(`click`,e=>{let t=e.target?.closest(`.delete-budget-btn`);t?.dataset.budgetId&&mt(t.dataset.budgetId)});let t=e.querySelector(`#saveBudgetBtn`);t&&t.addEventListener(`click`,()=>{let t=parseFloat(I(e,`#budAmt`).value),n=I(e,`#budCurr`).value;if(!t||t<=0)return alert(`Enter a valid amount.`);let r=t;n!==`EUR`&&(r=t*(o[n]||1));let i={id:F(),tripId:I(e,`#budTrip`).value,categoryId:I(e,`#budCat`).value,user:I(e,`#budUser`).value,amount:r,originalAmount:t,originalCurrency:n};b.budgets.push(i),T(`state:changed`),Yt(i),q(`budgets`)})},0),e}function gt(){let e=document.createElement(`div`),t=b.archivedTrips||[];return e.innerHTML=`
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #007aff; --g-to: #5856d6;">Collections</h1>
            <p>Your completed travel memories and trip photos.</p>
        </div>
        
        <div class="trip-nav glass" style="margin-top: 24px; display: none;">
            <button class="trip-tab active" id="tabArchived">Completed Trips</button>
        </div>

        <div id="colArchived" class="col-tab-content">
            <div class="grid-2" style="margin-top: 16px;">
                ${t.length>0?t.map(e=>`
                    <div class="card glass card-glow-blue" style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding: 20px;">
                        <div class="archived-trip-card" data-trip-id="${e.id}" role="button" tabindex="0" aria-label="Open ${e.name} details" style="cursor: pointer; flex: 1;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <h3 style="margin: 0;">${e.name}</h3>
                            </div>
                            <p style="color: var(--text-secondary); margin: 4px 0 0 0; font-size: 0.85rem;">${e.country}</p>
                            <p style="color: var(--text-secondary); margin: 2px 0 0 0; font-size: 0.85rem;">${(e.expenses||[]).filter(e=>!e.isSettlement).length} expenses</p>
                            <p style="color: var(--accent-blue); margin: 2px 0 0 0; font-size: 0.85rem; font-weight: 700;">Total: ${j((e.expenses||[]).filter(e=>!e.isSettlement).reduce((e,t)=>e+(t.euroValue||0),0),`EUR`)}</p>
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
                            <div style="display: flex; gap: var(--space-2);">
                                <button class="btn-primary restore-trip-btn" data-trip-id="${e.id}" style="padding: var(--space-2) var(--space-4); font-size: var(--font-sm);">Restore</button>
                                <button class="icon-action-btn delete-archived-btn" data-trip-id="${e.id}" style="--accent: 255,59,48;" title="Delete Permanently">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                `).join(``):`
                    <div class="card glass" style="grid-column: 1 / -1; text-align: center; padding: 60px;">
                        <div style="font-size: 4rem; margin-bottom: 20px;">📚</div>
                        <h2>No completed trips</h2>
                        <p class="text-muted">Your travel history will appear here once you complete a trip.</p>
                    </div>
                `}
            </div>
        </div>
    `,e.querySelector(`#collectionsLoginBtn`)?.addEventListener(`click`,()=>q(`profile`)),e.addEventListener(`click`,e=>{let t=e.target;if(!t)return;let n=t.closest(`.restore-trip-btn`);if(n?.dataset.tripId){bt(n.dataset.tripId);return}let r=t.closest(`.delete-archived-btn`);if(r?.dataset.tripId){xt(r.dataset.tripId);return}let i=t.closest(`.archived-trip-card`);if(i?.dataset.tripId){vt(i.dataset.tripId);return}}),e.addEventListener(`change`,e=>{let t=e.target?.closest(`.trip-privacy-toggle`);t?.dataset.tripId&&yt(t.dataset.tripId,t.checked)}),je(e),e}function _t(e){let t=b.archivedTrips.find(t=>t.id===e),n=document.createElement(`div`);if(!t)return n.innerHTML=`<p style="padding: 40px; text-align: center;">Trip not found.</p>`,n;let r=0;(t.expenses||[]).filter(e=>!e.isSettlement).forEach(e=>r+=e.euroValue||0);let i=null;if(t.tripDays){for(let e of t.tripDays)if(e.photos&&e.photos.length>0){i=e.photos[0];break}}return n.innerHTML=`
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
                <span style="display: flex; align-items: center; gap: 8px;">${j(r,`EUR`)} spent</span>
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
    `,n.querySelector(`#backToCollectionsBtn`)?.addEventListener(`click`,()=>q(`collections`)),n.addEventListener(`click`,e=>{let t=e.target?.closest(`.restore-trip-btn`);t?.dataset.tripId&&bt(t.dataset.tripId)}),n.addEventListener(`change`,e=>{let t=e.target?.closest(`.trip-privacy-toggle`);t?.dataset.tripId&&yt(t.dataset.tripId,t.checked)}),n}var vt=e=>{let t=document.getElementById(`app-container`);t&&(t.innerHTML=``,t.appendChild(_t(e)))},yt=async(e,t)=>{let n=b.archivedTrips.find(t=>t.id===e)||b.trips.find(t=>t.id===e);if(!n)return;n.isPublic=t,T(`state:changed`);let r=document.getElementById(`publicLabel-${e}`);if(r&&(r.textContent=t?`Public`:`Not public`,r.style.color=t?`#34c759`:`rgba(0,0,0,0.3)`,r.style.textShadow=t?`0 0 12px rgba(52, 199, 89, 0.6)`:`none`),b.user)try{await fetch(J(`/api/trips/privacy`),{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({user_id:b.user.id,trip_id:e,is_public:t})})}catch{}},bt=e=>{let t=b.archivedTrips.find(t=>t.id===e);t&&P({title:`Restore Trip?`,message:`This will move the trip back to your active list.`,confirmText:`Restore`,onConfirm:()=>{t.isArchived=!1,t.expenses&&(b.expenses=[...b.expenses,...t.expenses],delete t.expenses),t.tripDays&&(b.tripDays=[...b.tripDays,...t.tripDays],delete t.tripDays),b.trips.push(t),b.archivedTrips=b.archivedTrips.filter(t=>t.id!==e),b.activeTripId=e,T(`state:changed`),q(`home`)}})},xt=e=>{P({title:`Delete Permanently?`,message:`This trip and all its memories will be gone forever.`,confirmText:`Delete`,onConfirm:async()=>{if(b.archivedTrips=b.archivedTrips.filter(t=>t.id!==e),T(`state:changed`),b.user)try{await fetch(J(`/api/trips/delete`),{method:`DELETE`,headers:{"Content-Type":`application/json`},body:JSON.stringify({user_id:b.user.id,trip_id:e})})}catch{}q(`collections`)}})},K=null,St=[];function Ct(){let e=document.createElement(`div`),t=b.trips.find(e=>e.id===b.activeTripId);if(!t)return e.innerHTML=`
            <div style="padding:32px 0 24px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',sans-serif;">
                <h1 style="margin:0 0 6px;font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;background:linear-gradient(135deg,var(--accent-blue),#9b59b6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Plan with AI ✦</h1>
                <p style="margin:0;color:var(--text-secondary);font-size:1rem;">Your AI-powered travel planner</p>
            </div>
            <div style="position: relative; width: 100%; height: calc(100vh - 200px); min-height: 480px; border-radius: 20px; overflow: hidden; box-shadow: 0 40px 100px rgba(0,0,0,0.15);">
                <div id="emptyMap" style="width:100%; height:100%;"></div>
                <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);z-index:1000;">
                    <div class="premium-glass-card" style="text-align:center;color:#002d5b;padding:48px;max-width:500px;background:rgba(255,255,255,0.6);border-radius:36px;border:1px solid rgba(255,255,255,0.8);box-shadow: 0 30px 60px rgba(0,0,0,0.1), 0 10px 20px rgba(0,0,0,0.05);">
                        <div style="font-size:4.5rem;margin-bottom:24px;filter:drop-shadow(0 10px 15px rgba(0,0,0,0.1));">🧭</div>
                        <h2 style="font-size:2rem;font-weight:800;margin-bottom:16px;letter-spacing:-0.03em;">Ready for a new adventure?</h2>
                        <p style="font-size:1.15rem;opacity:0.85;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;margin-bottom:32px;">To generate a personalized AI itinerary, you'll need to create a trip first.</p>
                        <button id="aiStartJourneyBtn" class="btn-primary btn-primary--lg" style="max-width: none; width: auto; padding: 16px 36px; font-size: 1.15rem;">+ Start Your Journey</button>
                    </div>
                </div>
            </div>`,setTimeout(()=>{e.querySelector(`#aiStartJourneyBtn`)?.addEventListener(`click`,()=>Te()),typeof google<`u`&&google.maps&&new google.maps.Map(document.getElementById(`emptyMap`),{center:{lat:20,lng:0},zoom:2,minZoom:2,restriction:{latLngBounds:{north:85,south:-85,west:-180,east:180},strictBounds:!0},styles:[]})},100),e;let n=t.country||``,r=(b.tripDays||[]).filter(e=>e.tripId===b.activeTripId&&e.dayNumber>0&&e.date).map(e=>e.date).sort(),i=b.expenses.filter(e=>e.tripId===b.activeTripId&&e.date).sort((e,t)=>e.date.localeCompare(t.date)).map(e=>e.date),a=r[0]||i[0]||``,o=r[r.length-1]||i[i.length-1]||``,s=t.aiPlan||null,c=t.aiContext||``,l=t.aiNumDays||1,u=ye(t),d=`font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',sans-serif;`;return e.innerHTML=`
        <div style="${d}">
            <!-- Header -->
            <div style="padding:32px 0 24px;">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
                    <h1 style="margin:0;font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;background:linear-gradient(135deg,var(--accent-blue),#9b59b6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Plan with AI ✦</h1>
                </div>
                <p style="margin:0;color:var(--text-secondary);font-size:1rem;">Planning your trip to <strong>${n}</strong></p>
            </div>

            <!-- Top 2-col: Controls | Map -->
            <div style="display:grid;grid-template-columns:380px 1fr;gap:24px;margin-bottom:32px;">

                <!-- Left: Controls. min-height matches the sticky map (700px) so
                     the Requirements card can flex-grow into the spare space and
                     the Generate button bottom lines up with the map's bottom. -->
                <div id="aiControlsPanel" style="display:flex;flex-direction:column;gap:16px;min-height:700px;">
                    <!-- AI Engine badge -->
                    <div class="card glass" style="padding:18px;border-color:rgba(155,89,182,0.3);flex:0 0 auto;">
                        <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.07em;color:#9b59b6;margin-bottom:8px;">✦ AI Engine</h2>
                        <p style="color:var(--text-secondary);font-size:0.82rem;margin:0;">Secure server-side Gemini integration.</p>
                    </div>
                    <!-- Dates -->
                    <div class="card glass" style="padding:20px;flex:0 0 auto;">
                        <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.07em;color:var(--accent-blue);margin-bottom:14px;">📅 Travel Dates</h2>
                        <div style="display:flex; flex-direction:column; gap:12px;">
                            <div>
                                <label style="display:block;font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;">From</label>
                                <input id="aiDateFrom" type="date" class="glass-input" value="${a}" style="width:100%; box-sizing: border-box;">
                            </div>
                            <div>
                                <label style="display:block;font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;">To</label>
                                <input id="aiDateTo" type="date" class="glass-input" value="${o}" style="width:100%; box-sizing: border-box;">
                            </div>
                        </div>
                    </div>

                    <div class="card glass" style="padding:20px;flex:1 1 auto;display:flex;flex-direction:column;min-height:0;">
                        <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;color:var(--accent-blue);margin-bottom:10px;letter-spacing:0.05em;">📝 Requirements</h2>
                        <textarea id="aiExtraContext" class="glass-input" style="width:100%; resize:none; font-size:0.9rem; box-sizing: border-box; flex:1 1 auto; min-height:120px;" placeholder="e.g. Vegetarian friendly, no walking more than 2km...">${c}</textarea>
                    </div>
                    <!-- Generate -->
                    ${u?`<button id="generateBtn" class="ai-generate-btn" style="width:100%; border-radius: var(--radius-lg);flex:0 0 auto;">✦ Generate My Itinerary</button>`:(()=>{let e=ve(t);return`<div class="card glass" style="padding:16px; border-radius: var(--radius-lg); text-align:center; color: var(--text-secondary); font-size: 0.85rem; flex:0 0 auto;">
                                👁 You're a ${e===`budgeteer`?`Budgeteer`:e===`relaxer`?`Relaxer`:`observer`} on this trip — ${e===`budgeteer`?`you handle the trip's expenses but the itinerary is up to the Planners.`:`generating a new plan is up to the Planners.`}
                            </div>`})()}
                </div>

                <!-- Right: Google Map (sticky) -->
                <div style="position:sticky;top:80px;height:700px;">
                    <div class="card glass" style="padding:0;overflow:hidden;height:100%;border-radius:18px;position:relative;">
                        <div id="aiGoogleMap" style="width:100%;height:100%;"></div>
                        <div id="aiZoomBadge" style="position:absolute;bottom:14px;left:14px;z-index:1000;">
                            <span>📍</span> <span>${n}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Marked Places (full-width below) — places the user
                 stamped from the home map InfoWindow with "Mark for AI".
                 Each card shows the place + day/time-of-day dropdowns
                 (only when dates are entered, since assignments need a
                 day to bind to) + a remove button. The Generate flow
                 below appends these into Gemini's prompt context. -->
            <div id="aiMarkedPlacesPanel" style="margin-bottom: 32px;"></div>

            <!-- Itinerary Output (full-width below) -->
            <div id="itineraryOutput" style="margin-bottom: 60px;"></div>
        </div>`,setTimeout(()=>{let r=e=>{if(!K)return;let n=t.id+`_ai`;if(b.mapViews&&b.mapViews[n]){let e=b.mapViews[n];K.setCenter({lat:e.lat,lng:e.lng}),K.setZoom(e.zoom);return}if(t.viewport){let e=t.viewport;K.fitBounds(new google.maps.LatLngBounds({lat:e.south,lng:e.west},{lat:e.north,lng:e.east}));return}let r=e.replace(/\(USA\)/g,``).trim();r.includes(` - `)&&(r=r.split(` - `)[1]+`, USA`),new google.maps.Geocoder().geocode({address:r},(e,t)=>{t===`OK`&&e[0]&&K.fitBounds(e[0].geometry.viewport)})};if(typeof google<`u`&&google.maps){let i=document.getElementById(`aiGoogleMap`);i&&(K=new google.maps.Map(i,{center:{lat:20,lng:0},zoom:2,minZoom:2,mapTypeId:`roadmap`,disableDefaultUI:!0,restriction:{latLngBounds:{north:85,south:-85,west:-180,east:180},strictBounds:!0},styles:[]}),r(n),K.addListener(`idle`,()=>{let e=t.id+`_ai`;b.mapViews||={};let n=K.getCenter();b.mapViews[e]={lat:n.lat(),lng:n.lng(),zoom:K.getZoom()},T(`state:changed`)}));let a=e.querySelector(`#aiZoomBadge`);a&&(a.onclick=()=>{let e=t.id+`_ai`;b.mapViews&&b.mapViews[e]&&delete b.mapViews[e],r(n)})}let i=s,a=(n,r,i)=>{let a=I(e,`#itineraryOutput`);if(!n||!n.length){a.innerHTML=``;return}a.innerHTML=`
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
                    <div>
                        <h2 style="margin:0;font-size:2rem;font-weight:800;letter-spacing:-0.03em;color:white;${d}">${r}-Day ${i} Itinerary</h2>
                        <p style="color:var(--text-secondary);margin:6px 0 0;font-size:0.9rem;">Generated by Gemini AI</p>
                    </div>
                    <div style="font-size:0.78rem;color:var(--text-secondary);background:var(--glass-bg);border:1px solid var(--glass-border);padding:5px 14px;border-radius:980px;">✦ AI-Generated</div>
                </div>
                <div id="itineraryDays" style="display:flex;flex-direction:column;gap:16px;"></div>
                ${u?`<div style="display:flex;gap:12px;margin-top:24px;"><button id="acceptPlanBtn" class="btn" style="flex:2;background:var(--accent-blue);color:white;padding:16px;font-size:1.1rem;border-radius:16px;font-weight:700;box-shadow:0 10px 20px rgba(0,122,255,0.2);cursor:pointer;">Accept Plan & Add to Trip</button></div>`:``}`;let o=I(a,`#itineraryDays`),s=[];if(n.forEach((e,t)=>{let n=document.createElement(`div`);n.className=`card glass`,n.style.cssText=`border-radius:18px;overflow:hidden;transition:box-shadow 0.3s,border-color 0.3s;${d}`,n.innerHTML=`
                    <div style="display:flex;align-items:stretch;">
                        <div class="ai-day-chip">
                            <span style="color:rgba(255,255,255,0.7);font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Day</span>
                            <span style="color:white;font-size:2rem;font-weight:800;line-height:1;">${e.day}</span>
                        </div>
                        <div style="flex:1;padding:var(--space-6) 28px;">
                            <div style="margin-bottom:var(--space-5);">
                                <h3 style="margin:0 0 var(--space-1);font-size:1.2rem;font-weight:700;letter-spacing:-0.02em;color:white;">${e.title||`Day `+e.day}</h3>
                                <span style="font-size:var(--font-base);color:var(--text-secondary);">${e.date||``}</span>
                            </div>
                            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-4);margin-bottom:${e.tip?`var(--space-5)`:`0`};">
                                <div class="ai-plan-block" style="--accent: 0,113,227;">
                                    <div class="ai-plan-block__tag">🌅 Morning</div>
                                    <div class="ai-plan-block__title">${e.morning?.activity||``}</div>
                                    <div class="ai-plan-block__desc">${e.morning?.description||``}</div>
                                </div>
                                <div class="ai-plan-block" style="--accent: 255,149,0;">
                                    <div class="ai-plan-block__tag">☀️ Afternoon</div>
                                    <div class="ai-plan-block__title">${e.afternoon?.activity||``}</div>
                                    <div class="ai-plan-block__desc">${e.afternoon?.description||``}</div>
                                </div>
                                <div class="ai-plan-block" style="--accent: 155,89,182;">
                                    <div class="ai-plan-block__tag">🌙 Evening</div>
                                    <div class="ai-plan-block__title">${e.evening?.activity||``}</div>
                                    <div class="ai-plan-block__desc">${e.evening?.description||``}</div>
                                </div>
                            </div>
                            ${e.tip?`<div class="pro-tip"><span style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent-blue);">💡 Pro Tip</span><p style="margin:5px 0 0;font-size:var(--font-sm);color:var(--text-secondary);">${e.tip}</p></div>`:``}
                        </div>
                    </div>`,o.appendChild(n),s.push(n)}),K){St.forEach(e=>e.setMap(null)),St=[];let e=new google.maps.LatLngBounds,t=new google.maps.Geocoder,r=(n,r)=>{let a=n.mainLocation||n.title||i;!n.mainLocation&&n.title&&(a=n.title.replace(/Exploring |Day Trip to |Visit |Touring |Arrival in |Departure from |Day \d+:? /gi,``).trim()),t.geocode({address:a+`, `+i},(t,i)=>{if(i===`OK`&&t[0]){let i=t[0].geometry.location;n.lat=i.lat(),n.lon=i.lng();let a=new google.maps.Marker({position:i,map:K,label:{text:String(n.day),color:`white`,fontWeight:`800`},icon:{path:google.maps.SymbolPath.CIRCLE,scale:16,fillColor:`#0071e3`,fillOpacity:1,strokeWeight:2,strokeColor:`white`}});a.addListener(`click`,()=>{s.forEach(e=>{e.style.boxShadow=``,e.style.borderColor=``});let e=s[r];e&&(e.style.boxShadow=`0 0 0 3px var(--accent-blue), 0 8px 32px rgba(0,113,227,0.25)`,e.style.borderColor=`var(--accent-blue)`,e.scrollIntoView({behavior:`smooth`,block:`center`}))}),St.push(a),e.extend(i),St.length>0&&K.fitBounds(e)}})};n.forEach((e,t)=>setTimeout(()=>r(e,t),t*500))}let c=document.getElementById(`acceptPlanBtn`);c&&(c.onclick=()=>{if(!n)return;let e=b.tripDays.filter(e=>e.tripId===t.id&&e.dayNumber>0);b.tripDays=b.tripDays.filter(e=>!(e.tripId===t.id&&e.dayNumber>0)),e.forEach(e=>Zt(e.id)),n.forEach((e,n)=>{let r=e.date||new Date().toISOString().split(`T`)[0],i={id:`day_`+Date.now()+`_`+n,tripId:t.id,date:r,name:e.title||`Day ${n+1}`,dayNumber:n+1,lat:e.lat,lng:e.lon,photos:[],tickets:[],notes:``,plan:{morning:e.morning?`${e.morning.activity}: ${e.morning.description}`:``,afternoon:e.afternoon?`${e.afternoon.activity}: ${e.afternoon.description}`:``,evening:e.evening?`${e.evening.activity}: ${e.evening.description}`:``}};b.tripDays.push(i),$(i)}),T(`state:changed`),c.innerHTML=`✓ Plan Accepted! (View in Home)`,c.style.background=`#34c759`,c.disabled=!0})},o=()=>{let n=e.querySelector(`#aiMarkedPlacesPanel`);if(!n)return;let r=Me(t).filter(e=>e.forAI);if(r.length===0){n.innerHTML=`
                    <div class="card glass" style="padding: 20px; border-radius: 18px; border: 1.5px dashed rgba(88, 86, 214, 0.35); background: rgba(88, 86, 214, 0.04);">
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
                            <span style="font-size: 1.2rem;">🤖</span>
                            <h3 style="margin:0; color:#5856d6; font-weight:800; letter-spacing:-0.01em;">Marked for AI</h3>
                        </div>
                        <p style="margin:0; color: var(--text-secondary); font-size: 0.9rem;">No places marked yet. On the Home map, click any pin and hit <strong>🤖 Mark for AI</strong> to add it here. Once dates are set above, you'll be able to assign each marked place to a specific day and part of the day; the AI will respect those when generating your itinerary.</p>
                    </div>
                `;return}let i=e.querySelector(`#aiDateFrom`),a=e.querySelector(`#aiDateTo`),s=!!(i?.value&&a?.value),c=(b.tripDays||[]).filter(e=>e.tripId===t.id&&e.dayNumber>0).sort((e,t)=>e.dayNumber-t.dayNumber),l=e=>`
                <option value="" ${e?``:`selected`}>Any day</option>
                ${c.map(t=>`
                    <option value="${L(t.id)}" ${t.id===e?`selected`:``}>
                        Day ${t.dayNumber}${t.date?` — ${le(t.date)||t.date}`:``}
                    </option>
                `).join(``)}
            `,u=e=>`
                <option value="" ${e?``:`selected`}>Any time</option>
                <option value="morning"   ${e===`morning`?`selected`:``}>🌅 Morning</option>
                <option value="afternoon" ${e===`afternoon`?`selected`:``}>☀️ Afternoon</option>
                <option value="evening"   ${e===`evening`?`selected`:``}>🌙 Evening</option>
            `,d=r.map(e=>`
                <div class="ai-marked-card" data-place-id="${L(e.placeId)}" style="background:white; border:1.5px solid ${e.color}; border-radius:14px; padding:14px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); display:flex; flex-direction:column; gap:10px; min-height: 0;">
                    <div style="display:flex; align-items:flex-start; gap:8px;">
                        <span style="font-size:1.4rem; line-height:1;">${e.icon}</span>
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight:800; color:#002d5b; font-size:0.95rem; line-height:1.25;">${L(e.name)}</div>
                            ${e.address?`<div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">${L(e.address)}</div>`:``}
                        </div>
                        <button type="button" class="marked-remove-btn" data-place-id="${L(e.placeId)}" title="Remove from AI list" aria-label="Remove ${L(e.name)}"
                            style="background: rgba(255,59,48,0.08); border: 1px solid rgba(255,59,48,0.25); color:#ff3b30; border-radius: 8px; padding: 4px 8px; font-size:0.75rem; font-weight:800; cursor:pointer; flex-shrink:0;">✕</button>
                    </div>
                    ${s?`
                        <div style="display:flex; gap:8px; min-width:0;">
                            <select class="marked-day-select" data-place-id="${L(e.placeId)}" style="flex:1 1 0; min-width:0; max-width:100%; padding:6px 8px; border-radius:8px; border:1px solid rgba(0,0,0,0.1); font-size:0.78rem; background:white;">
                                ${l(e.dayId)}
                            </select>
                            <select class="marked-time-select" data-place-id="${L(e.placeId)}" style="flex:1 1 0; min-width:0; max-width:100%; padding:6px 8px; border-radius:8px; border:1px solid rgba(0,0,0,0.1); font-size:0.78rem; background:white;">
                                ${u(e.timeOfDay)}
                            </select>
                        </div>
                    `:`
                        <div style="font-size:0.75rem; color:var(--text-secondary); font-style:italic;">Set Travel Dates above to assign this to a specific day / time of day.</div>
                    `}
                </div>
            `).join(``);n.innerHTML=`
                <div class="card glass" style="padding:20px; border-radius:18px; border: 1.5px solid rgba(88, 86, 214, 0.25);">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
                        <span style="font-size: 1.2rem;">🤖</span>
                        <h3 style="margin:0; color:#5856d6; font-weight:800; letter-spacing:-0.01em;">Marked for AI <span style="background:rgba(88,86,214,0.12); color:#5856d6; font-size:0.7rem; padding:2px 8px; border-radius:999px; margin-left:6px;">${r.length}</span></h3>
                        <span style="margin-left:auto; font-size:0.78rem; color:var(--text-secondary);">Will be fed into Gemini's prompt when you Generate.</span>
                    </div>
                    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap:12px;">
                        ${d}
                    </div>
                </div>
            `,n.querySelectorAll(`.marked-remove-btn`).forEach(e=>{e.onclick=()=>{let n=e.dataset.placeId;n&&(Fe(t,n),T(`state:changed`),Q(t),o())}}),n.querySelectorAll(`.marked-day-select, .marked-time-select`).forEach(e=>{e.onchange=()=>{let r=e.dataset.placeId;if(!r)return;let i=n.querySelector(`.ai-marked-card[data-place-id="${r}"]`);if(!i)return;let a=i.querySelector(`.marked-day-select`),o=i.querySelector(`.marked-time-select`);Ie(t,r,a?.value||null,o?.value||null),T(`state:changed`),Q(t)}})};o(),i&&a(i,l,n);let c=e.querySelector(`#aiExtraContext`);c&&(c.oninput=e=>{t.aiContext=e.target.value,T(`state:changed`)}),[`#aiDateFrom`,`#aiDateTo`].forEach(t=>{let n=e.querySelector(t);n&&n.addEventListener(`change`,()=>o())}),e.querySelector(`#generateBtn`)?.addEventListener(`click`,async()=>{let r=I(e,`#itineraryOutput`),o=I(e,`#aiDateFrom`).value,s=I(e,`#aiDateTo`).value,c=document.getElementById(`aiExtraContext`)?.value??``;if(!o||!s){alert(`Please select your travel dates.`);return}let l=new Date(o),u=new Date(s),d=Math.max(1,Math.round((u.getTime()-l.getTime())/864e5)+1),f=Me(t).filter(e=>e.forAI),p=``;if(f.length>0){let e=(b.tripDays||[]).filter(e=>e.tripId===t.id&&e.dayNumber>0),n=t=>e.find(e=>e.id===t)?.dayNumber;p=`\n\nThe user has marked these specific places to include in the itinerary. Please incorporate them where they fit, respecting any day/time assignments where given:\n${f.map(e=>{let t=e.dayId?n(e.dayId):null,r=t?`, on Day ${t}`:``,i=e.timeOfDay?`, ${e.timeOfDay}`:``,a=e.address?` (${e.address})`:``;return`- ${e.name}${a}${r}${i}`}).join(`
`)}`}let m=c+p;t.aiContext=c,t.aiNumDays=d,T(`state:changed`),r.innerHTML=`<div style="text-align:center;padding:60px;"><div class="spinner-ring" style="width:40px;height:40px;border:3px solid rgba(255,255,255,0.1);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 20px;"></div><div style="color:white;font-weight:600;">Consulting Gemini AI...</div></div>`,r.scrollIntoView({behavior:`smooth`});try{let e=await(await Y(`/api/generate_itinerary`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({destination:n,numDays:d,dateFrom:o,dateTo:s,context:m})})).json();if(e.error)throw Error(e.error);i=e.itinerary,t.aiPlan=i??void 0,T(`state:changed`),a(i,d,n),r.scrollIntoView({behavior:`smooth`})}catch(e){r.innerHTML=`<div class="card glass" style="text-align:center;padding:40px;"><h2 style="color:#ff3b30;">Generation Failed</h2><p>${e.message}</p></div>`}})},0),e}function wt(){let e=document.createElement(`div`),t=b.activeTripId||(b.trips.length>0?b.trips[0].id:null);function n(e){let t=b.trips.find(t=>t.id===e),n=be(t),r=`
            <div style="margin-bottom: 32px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
                    <h2 style="font-size: 1.2rem; letter-spacing: -0.02em; margin: 0;">Select a Trip</h2>
                    <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 600;">${b.trips.length} Adventures</span>
                </div>
                <div style="display: flex; gap: 16px; overflow-x: auto; padding-bottom: 12px; scroll-behavior: smooth; -webkit-overflow-scrolling: touch;">
                    ${b.trips.map(t=>{let n=b.expenses.filter(e=>e.tripId===t.id&&e.isSettlement).reduce((e,t)=>e+(t.euroValue||0),0),r=t.id===e;return`
                            <button type="button" class="card-button-reset card glass settlement-trip-card${r?` is-active card-glow-blue`:``}" data-trip-id="${t.id}">
                                <div class="settlement-trip-card__label">Adventure</div>
                                <div class="settlement-trip-card__name">${L(t.name)}</div>
                                <div style="display: flex; align-items: center; justify-content: space-between;">
                                    <div class="settlement-trip-card__amount">${j(n,`EUR`)}</div>
                                    ${r?`<div class="settlement-trip-card__active-dot"></div>`:``}
                                </div>
                            </button>
                        `}).join(``)}
                </div>
            </div>
        `;if(!t)return`
                <div class="ai-page-header">
                    <h1 class="gradient-text" style="--g-from: #ffd60a; --g-to: #ff9f0a;">Settlements</h1>
                    <p>Calculate who owes what across your adventures.</p>
                </div>
                <div class="card glass card-glow-teal" style="text-align: center; padding: 60px; margin-top: 24px;">
                    <div style="font-size: 4rem; margin-bottom: 20px;">⚖️</div>
                    <h2>No trips found</h2>
                    <p class="text-muted">Create a trip and add expenses to see settlement calculations.</p>
                </div>
            `;let i=b.expenses.filter(t=>t.tripId===e),a=h(t),o=a.length>0?a:Array.from(new Set(i.flatMap(e=>[e.who,...Object.keys(e.splits||{})]).filter(Boolean))),s={};o.forEach(e=>s[e]=0),i.forEach(e=>{let t=e.euroValue||e.value||0,n=e.who;if(s[n]!==void 0&&(s[n]+=t),e.splits&&Object.keys(e.splits).length>0)for(let[n,r]of Object.entries(e.splits))s[n]!==void 0&&(s[n]-=t*(Number(r)/100));else{let e=t/Math.max(o.length,1);o.forEach(t=>s[t]-=e)}});let c=[],l=[],u=[];for(let[e,t]of Object.entries(s))t>.01?l.push({person:e,amount:t}):t<-.01&&u.push({person:e,amount:Math.abs(t)});let d=l.map(e=>({...e})),f=u.map(e=>({...e}));d.sort((e,t)=>t.amount-e.amount),f.sort((e,t)=>t.amount-e.amount);let p=0,m=0;for(;p<f.length&&m<d.length;){let e=Math.min(f[p].amount,d[m].amount);c.push({from:f[p].person,to:d[m].person,amount:e}),f[p].amount-=e,d[m].amount-=e,f[p].amount<.01&&p++,d[m].amount<.01&&m++}let g={};for(let e of[...b.trips,...b.archivedTrips||[]])for(let t of h(e))t in g||(g[t]=0);let _=(b.archivedTrips||[]).flatMap(e=>e.expenses||[]),v=[...b.expenses,..._],y={};for(let e of[...b.trips,...b.archivedTrips||[]])y[e.id]=h(e);v.forEach(e=>{let t=e.euroValue||e.euro_value||e.value||0,n=e.who;if(g[n]!==void 0&&(g[n]+=t),e.splits&&Object.keys(e.splits).length>0)for(let[n,r]of Object.entries(e.splits))g[n]!==void 0&&(g[n]-=t*(Number(r)/100));else{let r=y[e.tripId]||[],i=r.length>0?r:Array.from(new Set([n,...Object.keys(e.splits||{})].filter(Boolean))),a=t/Math.max(i.length,1);i.forEach(e=>{g[e]!==void 0&&(g[e]-=a)})}});let x=Math.max(...Object.values(g).map(Math.abs),1);return`
            <div class="ai-page-header">
                <h1 class="gradient-text" style="--g-from: #ffd60a; --g-to: #ff9f0a;">Settlements</h1>
                <p>Calculate who owes what and settle up fairly.</p>
            </div>

            ${r}

            <div class="card glass" style="margin-bottom: 24px; padding: 20px; border-radius: 20px; border-left: 4px solid var(--accent-blue); background: rgba(0, 113, 227, 0.03);">
                <div id="globalBalancesHeader" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                    <h2 class="card-title" style="margin: 0; font-size: 1.1rem; color: var(--text-primary);">🌍 Global Net Balances</h2>
                    <span style="font-size: 0.8rem; color: var(--accent-blue); font-weight: 700;">Show / Hide</span>
                </div>
                <div id="globalBalancesContainer" style="display: none; margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        ${(()=>{let e=Object.values(g).map(Math.abs).some(e=>e>.01);return Object.entries(g).map(([t,n])=>{let r=e?Math.abs(n)/x*100:0,i=n>=0;return`
                                    <div style="display: grid; grid-template-columns: 100px ${e?`1fr`:``} 80px; align-items: center; gap: var(--space-4);">
                                        <div style="font-weight: 700; font-size: var(--font-base);">${L(t)}</div>
                                        ${e?`
                                            <div class="balance-bar">
                                                <div class="balance-bar__fill balance-bar__fill--${i?`positive`:`negative`}" style="width: ${r}%;"></div>
                                            </div>
                                        `:``}
                                        <div style="text-align: right; font-weight: 800; font-size: var(--font-lg); color: ${n>.01?`#34c759`:n<-.01?`#ff3b30`:`var(--text-secondary)`};">
                                            ${n>.01?`+`:``}${j(n,`EUR`)}
                                        </div>
                                    </div>
                                `}).join(``)})()}
                    </div>
                </div>
            </div>

            <div style="margin-bottom: var(--space-6);">
                <div class="active-view-pill">
                    Active View: ${L(t.name)}
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
                            ${Object.entries(s).map(([e,t])=>`
                                <tr>
                                    <td style="font-weight: 500;">${L(e)}</td>
                                    <td style="text-align: right; color: ${t>=0?`#34c759`:`#ff3b30`}; font-weight: 700;">
                                        ${t>=0?`+`:``}${j(t,`EUR`)}
                                    </td>
                                </tr>
                            `).join(``)}
                        </tbody>
                    </table>
                </div>

                <div class="card glass card-glow-blue">
                    <h2 class="card-title">Suggested Payments</h2>
                    <div style="display: flex; flex-direction: column; gap: var(--space-3);">
                        ${c.length>0?c.map(t=>`
                            <div class="debt-row">
                                <div style="display: flex; align-items: center; gap: var(--space-4);">
                                    <div>
                                        <span class="debt-row__from-label">${L(t.from)} pays</span>
                                        <div class="debt-row__to-name">${L(t.to)}</div>
                                    </div>
                                    <div class="debt-row__amount">${j(t.amount,`EUR`)}</div>
                                </div>
                                ${n?`<button class="btn-primary settle-debt-btn" data-trip-id="${e}" data-from="${t.from}" data-to="${t.to}" data-amount="${t.amount}" style="padding: var(--space-2) var(--space-4); font-size: var(--font-sm);">Settle</button>`:``}
                            </div>
                        `).join(``):`<p class="text-muted" style="text-align: center; padding: var(--space-5); font-weight: 600;">All settled for this trip! 🥂</p>`}
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: var(--space-4); margin-top: var(--space-8); justify-content: center; flex-wrap: wrap;">
                ${n?`
                    <button class="btn-ghost open-manual-settle-btn" data-trip-id="${e}" style="color: var(--text-primary); padding: var(--space-4) var(--space-8); display: flex; align-items: center; gap: var(--space-2);">
                        <span>➕</span> Manual Settlement
                    </button>
                `:``}
                <button class="btn-ghost open-past-settle-btn" data-trip-id="${e}" style="color: var(--text-primary); padding: var(--space-4) var(--space-8); display: flex; align-items: center; gap: var(--space-2);">
                    <span>📜</span> Past Settlements
                </button>
            </div>
        `}let r=r=>{t=r,e.innerHTML=n(r)},i=(t,r,i,a,o=`EUR`)=>{let s=A(a,o,`EUR`),c={id:F(),tripId:t,label:`Settlement: ${r} → ${i}`,value:a,euroValue:s,currency:o,who:r,categoryId:b.categories[0]?.id??``,country:`Settlement`,date:new Date().toISOString().split(`T`)[0],splits:{[i]:100},isSettlement:!0};b.expenses.push(c),T(`state:changed`),e.innerHTML=n(t)},a=e=>{let t=h(b.trips.find(t=>t.id===e)).map(e=>`<option value="${e}">${e}</option>`).join(``),{root:n,close:r}=O({variant:`glass`,cardStyle:`width: 400px;`,innerHTML:`
                <h2 style="margin: 0 0 var(--space-5); font-size: var(--font-2xl); text-align: center; color: white;">Manual Settlement</h2>

                <form id="manualSettleForm" style="display: flex; flex-direction: column; gap: var(--space-4);">
                    <div>
                        <label class="form-label">From</label>
                        <select id="manualSettleFrom" class="glass-input-modal">${t}</select>
                    </div>
                    <div>
                        <label class="form-label">To</label>
                        <select id="manualSettleTo" class="glass-input-modal">${t}</select>
                    </div>
                    <div>
                        <label class="form-label">Amount (${k()})</label>
                        <input type="number" step="0.01" min="0.01" id="manualSettleAmount" class="glass-input-modal" placeholder="0.00" required>
                    </div>

                    <div style="margin-top: var(--space-3); display: flex; gap: var(--space-2);">
                        <button type="submit" class="btn-primary" style="flex: 1;">Record Payment</button>
                        <button type="button" id="cancelManualSettleBtn" class="btn-ghost">Cancel</button>
                    </div>
                </form>
            `});I(n,`#cancelManualSettleBtn`).onclick=()=>r(),I(n,`#manualSettleForm`).onsubmit=t=>{t.preventDefault();let a=I(n,`#manualSettleFrom`).value,o=I(n,`#manualSettleTo`).value,s=parseFloat(I(n,`#manualSettleAmount`).value);if(a===o){alert(`Sender and receiver must be different.`);return}i(e,a,o,s,k()),r()}},o=e=>{let t=be(b.trips.find(t=>t.id===e)),n=b.expenses.filter(t=>t.tripId===e&&t.isSettlement).sort((e,t)=>new Date(t.date).getTime()-new Date(e.date).getTime()),{root:r,close:i}=O({variant:`glass`,cardStyle:`width: 500px; max-height: 80vh; overflow-y: auto;`,innerHTML:`
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-6);">
                    <h2 style="margin: 0; font-size: var(--font-2xl); color: white;">Past Settlements</h2>
                    <button id="closePastSettleBtn" class="btn-ghost" style="padding: var(--space-2) var(--space-4); min-height: 0;">Close</button>
                </div>

                <div style="display: flex; flex-direction: column;">
                    ${n.length===0?`<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No past settlements recorded for this trip.</p>`:n.map(n=>`
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px; background: rgba(255,255,255,0.05); border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 12px;">
                    <div>
                        <div style="font-weight: 700; font-size: 1.1rem; color: white;">${L(n.label)}</div>
                        <div style="font-size: 0.8rem; color: rgba(255,255,255,0.7); margin-top: 4px;">${n.date}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 16px;">
                        <div style="font-size: 1.2rem; font-weight: 800; color: #34c759;">${j(n.euroValue,`EUR`)}</div>
                        ${t?`
                        <div style="display: flex; gap: 8px;">
                            <button class="themed-block-btn themed-block-btn--sm edit-settlement-btn" data-settlement-id="${n.id}" style="--accent: 255,255,255; color: white;">Edit</button>
                            <button class="themed-block-btn themed-block-btn--sm unsettle-settlement-btn" data-settlement-id="${n.id}" data-trip-id="${e}" style="--accent: 255,59,48;">Unsettle</button>
                        </div>
                        `:``}
                    </div>
                </div>
            `).join(``)}
                </div>
            `});I(r,`#closePastSettleBtn`).onclick=()=>i(),r.addEventListener(`click`,e=>{let t=e.target;if(!t)return;let n=t.closest(`.edit-settlement-btn`);if(n?.dataset.settlementId){c(n.dataset.settlementId),i();return}let r=t.closest(`.unsettle-settlement-btn`);if(r?.dataset.settlementId&&r.dataset.tripId){s(r.dataset.settlementId,r.dataset.tripId),i();return}})},s=(t,r)=>{P({title:`Unsettle Payment?`,message:`This will remove the settlement and revert the balances. Are you sure?`,confirmText:`Unsettle`,onConfirm:()=>{b.expenses=b.expenses.filter(e=>e.id!==t),T(`state:changed`),e.innerHTML=n(r)}})},c=r=>{let i=b.expenses.find(e=>e.id===r);if(!i)return;let a=h(b.trips.find(e=>e.id===i.tripId)),o=a.map(e=>`<option value="${e}" ${i.who===e?`selected`:``}>${e}</option>`).join(``),s=Object.keys(i.splits||{})[0],{root:c,close:l}=O({variant:`glass`,cardStyle:`width: 400px;`,innerHTML:`
                <h2 style="margin: 0 0 var(--space-5); font-size: var(--font-2xl); text-align: center; color: white;">Edit Settlement</h2>

                <form id="editSettlementForm" style="display: flex; flex-direction: column; gap: var(--space-4);">
                    <div>
                        <label class="form-label">From</label>
                        <select id="editSettleFrom" class="glass-input-modal">${o}</select>
                    </div>
                    <div>
                        <label class="form-label">To</label>
                        <select id="editSettleTo" class="glass-input-modal">${a.map(e=>`<option value="${e}" ${s===e?`selected`:``}>${e}</option>`).join(``)}</select>
                    </div>
                    <div>
                        <label class="form-label">Amount (${k()})</label>
                        <input type="number" step="0.01" min="0.01" id="editSettleAmount" value="${A(i.euroValue,`EUR`,k()).toFixed(2)}" class="glass-input-modal" required>
                    </div>
                    <div>
                        <label class="form-label">Date</label>
                        <input type="date" id="editSettleDate" value="${i.date}" class="glass-input-modal" required>
                    </div>

                    <div style="margin-top: var(--space-3); display: flex; gap: var(--space-2);">
                        <button type="submit" class="btn-primary" style="flex: 1;">Update</button>
                        <button type="button" id="cancelEditSettleBtn" class="btn-ghost">Cancel</button>
                    </div>
                </form>
            `});I(c,`#cancelEditSettleBtn`).onclick=()=>l(),I(c,`#editSettlementForm`).onsubmit=r=>{r.preventDefault();let a=I(c,`#editSettleFrom`).value,o=I(c,`#editSettleTo`).value,s=parseFloat(I(c,`#editSettleAmount`).value),u=I(c,`#editSettleDate`).value;if(a===o){alert(`Sender and receiver must be different.`);return}let d=k();i.who=a,i.splits={[o]:100},i.value=s,i.currency=d,i.euroValue=A(s,d,`EUR`),i.date=u,i.label=`Settlement: ${a} → ${o}`,T(`state:changed`),l(),e.innerHTML=n(t)}};return e.innerHTML=n(t),e.addEventListener(`click`,t=>{let n=t.target;if(!n)return;let s=n.closest(`.settlement-trip-card`);if(s?.dataset.tripId){r(s.dataset.tripId);return}let c=n.closest(`.settle-debt-btn`);if(c?.dataset.tripId&&c.dataset.from&&c.dataset.to&&c.dataset.amount){i(c.dataset.tripId,c.dataset.from,c.dataset.to,parseFloat(c.dataset.amount));return}let l=n.closest(`.open-manual-settle-btn`);if(l?.dataset.tripId){a(l.dataset.tripId);return}let u=n.closest(`.open-past-settle-btn`);if(u?.dataset.tripId){o(u.dataset.tripId);return}if(n.closest(`#globalBalancesHeader`)){let t=e.querySelector(`#globalBalancesContainer`);t&&(t.style.display=t.style.display===`none`?`block`:`none`);return}}),e}function Tt(e){let{user:t,variant:n=`neutral`,extraClass:r=``,rightSide:i=``,clickable:a=!1}=e,o=`user-row user-row--${n}${r?` `+r:``}`,s=a?` role="button" tabindex="0"`:``;return`
        <div class="${o}" data-user-id="${L(t.id)}"${s}>
            <div style="display: flex; align-items: center; gap: var(--space-3);">
                <img src="${L(t.picture||``)}" alt="" style="width: 32px; height: 32px; border-radius: 50%;">
                <div>
                    <div style="font-weight: 600; font-size: var(--font-base);">${L(t.name)}</div>
                    <div style="font-size: var(--font-xs); color: var(--text-secondary);">${L(t.email)}</div>
                </div>
            </div>
            ${i}
        </div>
    `}function Et(){let e=document.createElement(`div`),t=async()=>{if(b.user)try{let t=await(await Y(`/api/friends/list`)).json(),n=await(await Y(`/api/friends/pending`)).json(),r=e.querySelector(`#friendsList`),i=e.querySelector(`#pendingList`);r&&(t.length===0?r.innerHTML=`<div class="list-empty-state">No friends added yet.</div>`:r.innerHTML=t.map(e=>Tt({user:e,variant:`neutral`,extraClass:`friend-row`,clickable:!0,rightSide:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>`})).join(``)),i&&(n.length===0?i.innerHTML=`<div class="list-empty-state">No pending requests.</div>`:i.innerHTML=n.map(e=>Tt({user:e,variant:`warn`,rightSide:`<button class="btn btn-small accept-friend-btn" data-user-id="${e.id}" style="padding: 6px var(--space-3); font-size: var(--font-xs);">Accept</button>`})).join(``))}catch(e){console.error(`Error loading friends:`,e)}},n=async()=>{if(!b.user)return;let t=I(e,`#friendSearchInput`).value.trim(),n=I(e,`#searchResults`);if(t){n.innerHTML=`<p style="text-align:center; padding:10px; font-size:0.8rem; color:var(--text-secondary);">Searching...</p>`;try{let e=(await(await Y(`/api/friends/search?q=${encodeURIComponent(t)}`)).json()).filter(e=>e.id!==b.user?.id);e.length===0?n.innerHTML=`<p style="text-align:center; padding:10px; font-size:0.8rem; color:var(--text-secondary);">No user found. Ask them to login first!</p>`:n.innerHTML=e.map(e=>Tt({user:e,variant:`brand`,rightSide:`<button class="btn btn-small send-friend-btn" data-user-id="${e.id}" style="padding: 6px var(--space-3); font-size: var(--font-xs);">Send Request</button>`})).join(``)}catch{n.innerHTML=`<p style="color:red;">Error searching.</p>`}}},r=async n=>{if(!b.user){alert(`Please login first`);return}if(n===b.user.id){N(`You can't send a friend request to yourself!`);return}try{let r=await(await Y(`/api/friends/add`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({friend_id:n})})).json();r.status===`success`?(I(e,`#searchResults`).innerHTML=`<p style="text-align:center; padding:10px; font-size:0.8rem; color:#34c759;">Request sent!</p>`,I(e,`#friendSearchInput`).value=``,t()):r.status===`error`&&alert(r.message)}catch{alert(`Failed to send request`)}},i=async e=>{if(b.user)try{let n=await(await Y(`/api/friends/accept`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({friend_id:e})})).json();n.status===`success`?(N(`Friend request accepted!`),t()):alert(n.message||`Failed to accept request`)}catch(e){console.error(`Error accepting friend:`,e)}};return e.innerHTML=`
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #007aff; --g-to: #5856d6;">Friends</h1>
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
    `,e.querySelector(`#friendSearchBtn`)?.addEventListener(`click`,n),e.querySelector(`#friendSearchInput`)?.addEventListener(`keyup`,e=>{e.key===`Enter`&&n()}),e.addEventListener(`click`,e=>{let t=e.target;if(!t)return;let n=t.closest(`.accept-friend-btn`);if(n){i(n.dataset.userId);return}let a=t.closest(`.send-friend-btn`);if(a){r(a.dataset.userId);return}let o=t.closest(`.friend-row`);if(o){q(`profile`,{userId:o.dataset.userId});return}}),je(e),setTimeout(t,0),e}var Dt=async()=>{try{try{await X()}catch(e){console.error(`Final sync before logout failed:`,e)}Ft(),b.user=null,b.activeTripId=null,b.trips=[],b.archivedTrips=[],b.expenses=[],b.tripDays=[],b.budgets=[],b.activities=[],b.photos=[],b.notifications=[],b.savedFormats=[],b.profilePhoto=null,b.draftExpense={who:``,categoryId:``,label:``,date:``,country:``,value:``,currency:`EUR`,euroValue:``},T(`state:changed`),At(),q(`profile`)}catch{}};function Ot(){let e=document.createElement(`div`),t=b.hasLoggedInBefore;e.innerHTML=`
        <div class="login-wall">
            <div class="login-wall__inner">
                <h1 class="login-wall__title" style="background: linear-gradient(135deg, #0071e3 0%, #ff9500 50%, #34c759 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">The Great Getaway</h1>
                <p class="login-wall__subtitle">${t?`Welcome back. Sign in to pick up where you left off.`:`Plan trips, split expenses, and bring friends along — all synced across devices.`}</p>

                <div class="login-wall__features">
                    <div class="login-wall__feature">
                        <span class="login-wall__feature-icon">🗺️</span>
                        <div><strong>Trips &amp; days</strong><span>Plan and journal each day of your journey.</span></div>
                    </div>
                    <div class="login-wall__feature">
                        <span class="login-wall__feature-icon">💸</span>
                        <div><strong>Shared expenses</strong><span>Split costs and settle up cleanly.</span></div>
                    </div>
                    <div class="login-wall__feature">
                        <span class="login-wall__feature-icon">👥</span>
                        <div><strong>Friends &amp; companions</strong><span>Invite people to plan along with you.</span></div>
                    </div>
                </div>

                <div class="card glass login-wall__card">
                    <h2 class="login-wall__card-title">${t?`Sign back in`:`Create your account with Google`}</h2>
                    <div id="loginWallBtnContainer" class="login-wall__btn-container"></div>
                    <p class="login-wall__fineprint">Your data is tied to your Google account and synced server-side; signing out clears the local copy.</p>
                </div>
            </div>
        </div>
    `;let n=()=>{let t=e.querySelector(`#loginWallBtnContainer`);if(t){if(window.google&&window.google.accounts&&window.globalGoogleClientId){t.innerHTML=``,window.google.accounts.id.initialize({client_id:window.globalGoogleClientId,callback:window.handleGoogleLogin||(()=>{})}),window.google.accounts.id.renderButton(t,{theme:`outline`,size:`large`,width:280,shape:`pill`});return}setTimeout(n,250)}};return setTimeout(n,0),e}function kt(e=null){let t=document.createElement(`div`),n=!e||b.user&&e===b.user.id;if(!b.user&&n)return Ot();let r=(e,r)=>{let i=[...new Set((r||[]).map(e=>e.country).filter(Boolean))],a=e.picture;t.innerHTML=`
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
                                <button id="profileLogoutBtn" class="btn-logout">Log Out</button>
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
                                    <select id="profileStatus" class="brand-select" style="padding: 2px 24px 2px 10px; font-size: var(--font-base);">
                                        <option value="" disabled ${e.status?``:`selected`}>Set status...</option>
                                        <option value="Deliberating next trip" ${e.status===`Deliberating next trip`?`selected`:``}>🤔 Deliberating next trip</option>
                                        <option value="Preparing a trip right now" ${e.status===`Preparing a trip right now`?`selected`:``}>🎒 Preparing a trip right now</option>
                                        <option value="Exploring the world" ${e.status===`Exploring the world`?`selected`:``}>🌍 Exploring the world</option>
                                        <option value="Resting at home base" ${e.status===`Resting at home base`?`selected`:``}>🏠 Resting at home base</option>
                                        <option value="Hunting for flight deals" ${e.status===`Hunting for flight deals`?`selected`:``}>✈️ Hunting for flight deals</option>
                                    </select>
                                    <div class="brand-select-chevron" style="right: 8px;">▼</div>
                                `:`
                                    <div style="background: rgba(0, 113, 227, 0.05); color: var(--accent-blue); border-radius: var(--radius-md); padding: var(--space-1) var(--space-3); font-size: var(--font-base); font-weight: 700; display: inline-block;">
                                        ${e.status||`Active Traveler`}
                                    </div>
                                `}
                            </div>

                            <!-- Bio -->
                            ${n?`
                                <textarea id="profileBio" class="bio-input" placeholder="Add a bio...">${e.bio||``}</textarea>

                                <!-- Home currency picker — the currency totals
                                     and insights will be displayed in. -->
                                <div style="margin-top: 14px; max-width: 500px;">
                                    <label for="profileHomeCurrency" style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px; letter-spacing: 0.04em;">
                                        Home currency — what you'll see totals and insights in
                                    </label>
                                    <div style="position: relative; display: inline-block;">
                                        <select id="profileHomeCurrency" class="brand-select" style="padding: 6px 28px 6px 12px; font-size: var(--font-sm);">
                                            ${Object.keys(o).map(e=>`
                                                <option value="${e}" ${k()===e?`selected`:``}>${s[e]||e}  ${e}</option>
                                            `).join(``)}
                                        </select>
                                        <div class="brand-select-chevron" style="right: 10px;">▼</div>
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
        `,setTimeout(()=>{if(t.querySelector(`#profileBackToFriendsBtn`)?.addEventListener(`click`,()=>q(`friends`)),t.querySelector(`#profileLogoutBtn`)?.addEventListener(`click`,()=>Dt()),n){let e=t.querySelector(`#profileStatus`),n=t.querySelector(`#profileBio`),r=t.querySelector(`#profileHomeCurrency`),i=t.querySelector(`#saveProfileBtn`),a=()=>{i&&(i.style.opacity=`1`,i.style.pointerEvents=`auto`)};e&&(e.onchange=a),n&&(n.oninput=a),r&&(r.onchange=a),i&&(i.onclick=async()=>{if(!b.user||!e||!n)return;let t=e.value,a=n.value,o=r?r.value:b.user.homeCurrency||null;try{(await Y(`/api/profile/update`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({bio:a,status:t,homeCurrency:o})})).ok&&(b.user.bio=a,b.user.status=t,b.user.homeCurrency=o,T(`state:changed`),i.style.opacity=`0`,i.style.pointerEvents=`none`,N(`Profile updated!`))}catch{}});let o=t.querySelector(`#profilePhotoInput`),s=t.querySelector(`#profilePicWrapper`);s&&(s.onclick=()=>o&&o.click()),o&&(o.onchange=e=>{let n=e.target.files?.[0];if(!n)return;let r=new FileReader;r.onload=e=>{let n=typeof e.target?.result==`string`?e.target.result:null;b.profilePhoto=n,T(`state:changed`);let r=t.querySelector(`#profilePicDisplay`);r&&n&&(r.src=n)},r.readAsDataURL(n)})}if(typeof google<`u`&&google.maps){let e=document.getElementById(`legaciesMap`);if(e){let t=new google.maps.Map(e,{center:{lat:20,lng:0},zoom:2,minZoom:2,mapTypeId:`roadmap`,disableDefaultUI:!0,restriction:{latLngBounds:{north:85,south:-85,west:-180,east:180},strictBounds:!0},styles:[{featureType:`all`,elementType:`labels`,stylers:[{visibility:`off`}]},{featureType:`administrative`,elementType:`geometry`,stylers:[{visibility:`on`},{color:`#e0e0e0`}]},{featureType:`landscape`,stylers:[{color:`#f0f0f5`}]},{featureType:`water`,stylers:[{color:`#ffffff`}]}]});fetch(`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson`).then(e=>e.json()).then(e=>{t.data.addGeoJson(e),t.data.setStyle(e=>{let t=(e.getProperty(`NAME`)||e.getProperty(`name`)||e.getProperty(`admin`)||``).toLowerCase();if(!t)return{visible:!1};if(i.some(e=>{if(!e)return!1;let n=e.split(` (`)[0].split(` - `)[0].toLowerCase();return n===`usa`&&(n=`united states`),n===`uk`&&(n=`united kingdom`),t===n||t.includes(n)||n.includes(t)||n===`united states`&&(t.includes(`america`)||t===`usa`)})){let e=0;for(let n=0;n<t.length;n++)e=t.charCodeAt(n)+((e<<5)-e);return{fillColor:`hsl(${Math.abs(e%360)}, 70%, 60%)`,fillOpacity:.7,strokeColor:`#ffffff`,strokeWeight:.5,visible:!0}}return{fillColor:`#d0d0d5`,fillOpacity:.2,strokeColor:`#ffffff`,strokeWeight:.5,visible:!0}})});let n=new google.maps.Geocoder,a={};r.filter(e=>e.isPublic).forEach(e=>{let t=e.country||e.name;t&&(a[t]||(a[t]=[]),a[t].push(e))});let o=(e,n,r)=>{let i=new google.maps.Marker({position:e,map:t,icon:{path:google.maps.SymbolPath.CIRCLE,fillOpacity:1,fillColor:`#ff2d55`,strokeColor:`white`,strokeWeight:2,scale:r.length>1?14:10}}),a=r.map(e=>`
                            <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.06);">
                                <span style="font-weight: 600; color: #000;">${e.name}</span>
                                <button class="archived-trip-view-btn" data-trip-id="${e.id}" style="background: #007aff; color: white; border: none; padding: 4px 12px; border-radius: 8px; font-weight: 700; font-size: 0.75rem; cursor: pointer;">View</button>
                            </div>
                        `).join(``),o=document.createElement(`div`);o.style.cssText=`padding: 4px 8px; min-width: 220px; max-width: 300px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;`,o.innerHTML=`
                            <div style="font-weight: 800; font-size: 0.7rem; text-transform: uppercase; color: rgba(0,0,0,0.5); letter-spacing: 0.1em; margin-bottom: 6px;">${n} — ${r.length} trip${r.length>1?`s`:``}</div>
                            ${a}
                        `,o.addEventListener(`click`,e=>{let t=e.target?.closest(`.archived-trip-view-btn`);t?.dataset.tripId&&vt(t.dataset.tripId)});let s=new google.maps.InfoWindow({content:o});i.addListener(`click`,()=>s.open(t,i))};(async()=>{for(let[e,t]of Object.entries(a)){let r=t.find(e=>typeof e.lat==`number`&&typeof e.lng==`number`);if(r){o({lat:r.lat,lng:r.lng},e,t);continue}n.geocode({address:e},(n,r)=>{r===`OK`&&n[0]&&o(n[0].geometry.location,e,t)}),await new Promise(e=>setTimeout(e,800))}})()}}},100)};if(n){let e=[...b.trips||[],...b.archivedTrips||[]],t=new Date,n=e.filter(e=>e.isArchived||e.dateTo&&new Date(e.dateTo)<t);r(b.user,n)}else t.innerHTML=`<div style="display:flex; justify-content:center; align-items:center; height:300px;"><p style="font-weight:700; color:var(--text-secondary); animation: pulse 1.5s infinite;">Fetching profile...</p></div>`,fetch(J(`/api/public-profile/${e}`)).then(e=>e.json()).then(e=>{e.error?t.innerHTML=`<p style="text-align:center; padding:50px;">User not found.</p>`:r(e.user,e.trips)}).catch(()=>{t.innerHTML=`<p style="text-align:center; padding:50px;">Error loading profile.</p>`});return t}function At(){let e=document.getElementById(`sidebarProfileAvatar`),t=document.getElementById(`sidebarProfileIcon`),n=document.getElementById(`sidebarProfileLabel`),r=document.getElementById(`sidebarProfileSub`),i=document.getElementById(`sidebarProfilePic`),a=document.getElementById(`sidebarLogoutBtn`);document.body.classList.toggle(`is-signed-out`,!b.user),b.user?(e&&(e.style.display=`block`),t&&(t.style.display=`none`),n&&(n.textContent=b.user.name),r&&(r.style.display=`block`,r.textContent=`Logged in ✓`),i&&(i.src=b.user.picture??``),a&&(a.style.display=`block`)):(e&&(e.style.display=`none`),t&&(t.style.display=`block`),n&&(n.textContent=`Log in`),r&&(r.style.display=`none`),a&&(a.style.display=`none`))}var jt=!1;function q(t,n=null,r=!1){let i=document.getElementById(`app-container`);if(!i)return;Re(),i.innerHTML=``;let a=null;if(!b.user){i.appendChild(Ot()),document.querySelectorAll(`.nav-item`).forEach(e=>e.classList.remove(`active`)),jt=!0,window.location.hash=t,r||window.scrollTo(0,0);return}switch(t){case e.HOME:a=Je();break;case e.EXPENSES:a=lt();break;case e.UPLOAD:return ot(`batch`),q(e.EXPENSES,n,r);case e.INSIGHTS:a=pt();break;case e.SETTINGS:a=fe();break;case e.PERSONALIZATION:a=me();break;case e.BUDGETS:a=ht();break;case e.COLLECTIONS:a=gt();break;case e.AI:a=Ct();break;case e.SETTLEMENT:a=wt();break;case e.FRIENDS:a=Et();break;case e.PROFILE:a=kt(n?.userId);break;default:a=Je()}a&&i.appendChild(a),document.querySelectorAll(`.nav-item`).forEach(e=>{e.classList.toggle(`active`,e.getAttribute(`data-page`)===t)}),jt=!0,window.location.hash=t,r||window.scrollTo(0,0)}window.onhashchange=()=>{if(jt){jt=!1;return}let t=window.location.hash.replace(`#`,``);q(Object.values(e).includes(t)?t:e.HOME)};var J=e=>`${n}${e}`,Mt=`gg_auth_token`,Nt=()=>localStorage.getItem(Mt),Pt=e=>{e&&localStorage.setItem(Mt,e)},Ft=()=>localStorage.removeItem(Mt);function It(e={}){let t=Nt();return t?{...e,headers:{...e.headers||{},Authorization:`Bearer ${t}`}}:e}async function Y(e,n={}){let r=e.startsWith(`http`)?e:J(e),i=await fetch(r,It(n));return i.status===401&&Nt()&&(Ft(),b.user=null,T(t.STATE_CHANGED)),i}async function X(){if(b.user)try{await Y(`/api/sync`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({trips:b.trips,archived_trips:b.archivedTrips||[],expenses:b.expenses,activities:b.activities,photos:b.photos,categories:b.categories||[],budgets:b.budgets||[]})})}catch(e){console.error(`Sync failed:`,e)}}async function Lt(){if(b.user)try{let n=f(await(await Y(`/api/data`)).json());if(!n.ok){console.error(`pullFromServer: server data invalid —`,n.error);return}let r=n.value,i=(r.trips||[]).map(e=>({...e,companions:m(e.companions)})),a=b.user,o=a?.name?.split(` `)[0]||`Me`;for(let e of i)!a||e.ownerId!==a.id||e.companions.some(e=>e.linkedUserId===a.id)||e.companions.unshift({name:o,linkedUserId:a.id});b.trips=i.filter(e=>!e.isArchived),b.archivedTrips=i.filter(e=>e.isArchived),b.expenses=r.expenses||[],b.categories=r.categories||[],b.budgets=r.budgets||[],b.tripDays=r.tripDays||[],T(t.STATE_CHANGED),await $t();let s=Object.values(e),c=window.location.hash.replace(`#`,``);q(s.includes(c)?c:e.HOME)}catch(e){console.error(`Pull from server failed:`,e)}}var Z=(e,t)=>Y(e,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(t)}).catch(t=>console.error(`POST ${e} failed:`,t)),Rt=(e,t)=>Y(e,{method:`DELETE`,headers:{"Content-Type":`application/json`},body:JSON.stringify(t)}).catch(t=>console.error(`DELETE ${e} failed:`,t)),zt=async(e,t)=>{try{let n=await Y(e,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(t)}),r=null;try{r=await n.json()}catch{}return{ok:n.ok,status:n.status,body:r}}catch(t){return console.error(`POST ${e} failed:`,t),{ok:!1,status:0,body:null}}};function Q(e){if(b.user)return Z(`/api/trips`,{trip:e})}function Bt(e){if(b.user)return Rt(`/api/trips/${e}`,{})}function Vt(e){if(b.user)return Z(`/api/trips/${e}/archive`,{})}function Ht(e,t,n){if(b.user)return Z(`/api/trips/invite`,{trip_id:e,target_user_id:t,role:n})}function Ut(e,t){return b.user?zt(`/api/trips/invite/respond`,{trip_id:e,accept:t}):Promise.resolve({ok:!1,status:0,body:null})}function Wt(e,t){if(b.user)return Z(`/api/trips/members/remove`,{trip_id:e,target_user_id:t})}function Gt(e){if(b.user)return Z(`/api/expenses`,{expense:e})}function Kt(e){if(b.user)return Rt(`/api/expenses/${e}`,{})}async function qt(){if(!b.user)return[];try{let e=await(await Y(`/api/friends/list`)).json();return Array.isArray(e)?e:[]}catch(e){return console.error(`fetchAcceptedFriends failed:`,e),[]}}function Jt(){if(b.user)return Z(`/api/categories`,{categories:b.categories})}function Yt(e){if(b.user)return Z(`/api/budgets`,{budget:e})}function Xt(e){if(b.user)return Rt(`/api/budgets/${e}`,{})}function $(e){if(b.user)return Z(`/api/days`,{day:e})}function Zt(e){if(b.user)return Rt(`/api/days/${e}`,{})}async function Qt(e){if(!b.user)return null;let t=new FormData;t.append(`file`,e);try{return await(await Y(`/api/upload`,{method:`POST`,body:t})).json()}catch(e){return console.error(`Upload failed`,e),null}}async function $t(){if(b.user)try{b.notifications=await(await Y(`/api/notifications/list`)).json(),T(t.NOTIFICATIONS_CHANGED)}catch(e){console.error(`Failed to fetch notifications:`,e)}}async function en(){if(b.user)try{await Y(`/api/notifications/read`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({})}),b.notifications.forEach(e=>e.is_read=1),T(t.NOTIFICATIONS_CHANGED)}catch(e){console.error(`Failed to mark notifications read:`,e)}}async function tn(e){if(e.length===0)return;let t=[...e].sort(),n=t[0],r=t[t.length-1];if(!(!n||!r))try{let e=`https://api.frankfurter.app/${n}..${r}`,t=await fetch(e);if(t.ok){let e=await t.json();Object.entries(e.rates).forEach(([e,t])=>{Object.entries(t).forEach(([t,n])=>{b.rateCache[`${e}_${t}_EUR`]=1/n})}),T(`state:changed`)}}catch(e){console.error(`Failed to fetch historical rates:`,e)}}function nn(t){return Object.values(e).includes(t)?t:e.HOME}function rn(){let e=document.getElementById(`notificationBadge`),t=(b.notifications||[]).filter(e=>!e.is_read).length;e&&(e.style.display=t>0?`flex`:`none`,e.textContent=t>9?`9+`:String(t))}function an(e){switch(e){case`alert`:return`255,59,48`;case`trip_public`:return`52,199,89`;case`trip_invite`:return`175,82,222`;case`trip_invite_accepted`:return`52,199,89`;case`trip_invite_declined`:return`142,142,147`;case`trip_member_removed`:return`255,59,48`;default:return`0,113,227`}}function on(e){switch(e){case`friend_request`:return`Friend Request`;case`accepted_request`:return`Request Accepted`;case`trip_public`:return`Trip Completed`;case`trip_invite`:return`Trip invitation`;case`trip_invite_accepted`:return`Trip invite update`;case`trip_invite_declined`:return`Trip invite update`;case`trip_member_removed`:return`Removed from trip`;case`alert`:return`Alert`;default:return`Notification`}}function sn(){let e=document.getElementById(`notificationList`);if(!e)return;let t=b.notifications||[];if(t.length===0){e.innerHTML=`<div class="notification-empty">No new notifications</div>`;return}e.innerHTML=t.map((e,t)=>`
        <div class="notification-item ${e.is_read?``:`unread`}" data-notification-index="${t}" role="button" tabindex="0">
            <div class="notification-item__title" style="--accent: ${an(e.type)};">
                <span class="notification-item__dot"></span>
                ${L(e.title||on(e.type))}
            </div>
            <div class="notification-item__message">${L(e.message)}</div>
            <div class="notification-item__time">${new Date(e.created_at).toLocaleDateString()}</div>
        </div>
    `).join(``)}function cn(t){let n=document.getElementById(`notificationDropdown`);n&&(n.style.display=`none`);let r=t.related_id?String(t.related_id):null;switch(t.type){case`friend_request`:q(e.FRIENDS);break;case`accepted_request`:case`trip_public`:r?q(e.PROFILE,{userId:r}):q(e.FRIENDS);break;case`trip_invite`:Ae(t);break;case`trip_invite_accepted`:case`trip_invite_declined`:case`trip_member_removed`:q(e.HOME);break;default:q(e.HOME);break}}function ln(){let e=document.getElementById(`tripSelector`),t=document.getElementById(`completeTripBtn`),n=document.getElementById(`deleteTripBtn`);if(!e)return;if(b.trips.length===0){e.innerHTML=`<option value="">No Active Trips</option>`,t&&(t.style.display=`none`),n&&(n.style.display=`none`);return}e.innerHTML=b.trips.map(e=>`
        <option value="${L(e.id)}" ${e.id===b.activeTripId?`selected`:``}>${L(e.name)}</option>
    `).join(``);let r=!!b.activeTripId,i=b.trips.find(e=>e.id===b.activeTripId);t&&(t.style.display=r?`flex`:`none`),n&&(n.style.display=r&&Se(i)?`flex`:`none`),e.onchange=e=>{b.activeTripId=e.target.value,T(`state:changed`),q(`home`)}}w(`state:changed`,ln),w(`state:changed`,At),w(`notifications:changed`,rn);function un(){let e=b.trips.find(e=>e.id===b.activeTripId);e&&P({title:`Archive Trip?`,message:`This will move the trip to your collections and lock editing.`,confirmText:`Archive`,onConfirm:()=>{e.isArchived=!0,e.expenses=b.expenses.filter(t=>t.tripId===e.id),e.tripDays=b.tripDays.filter(t=>t.tripId===e.id),b.archivedTrips.push(e),b.expenses=b.expenses.filter(t=>t.tripId!==e.id),b.tripDays=b.tripDays.filter(t=>t.tripId!==e.id),b.trips=b.trips.filter(t=>t.id!==e.id),b.activeTripId=b.trips.length>0?b.trips[0].id:null,T(`state:changed`),Vt(e.id),q(`collections`)}})}var dn=()=>{let e=b.trips.find(e=>e.id===b.activeTripId);if(e){if(!Se(e)){P({title:`Owner only`,message:`Only the trip's owner can delete it. You can archive your own copy from the navbar instead.`,confirmText:`OK`,onConfirm:()=>{}});return}P({title:`Delete Trip?`,message:`Are you sure you want to delete "${e.name}" permanently? This will remove all associated expenses and days.`,confirmText:`Delete Permanently`,onConfirm:async()=>{b.trips=b.trips.filter(t=>t.id!==e.id),b.expenses=b.expenses.filter(t=>t.tripId!==e.id),b.tripDays=b.tripDays.filter(t=>t.tripId!==e.id),b.activeTripId=b.trips.length>0?b.trips[0].id:null,T(`state:changed`),Bt(e.id),q(`home`)}})}};async function fn(e){try{let t=await(await fetch(J(`/api/auth/google`),{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({credential:e.credential})})).json();t.status===`success`&&(t.token&&Pt(t.token),b.user=t.user,b.hasLoggedInBefore=!0,await X(),await Lt(),b.trips.length>0&&!b.trips.find(e=>e.id===b.activeTripId)&&(b.activeTripId=b.trips[0].id),T(`state:changed`),At(),q(`profile`))}catch(e){console.error(`Google Login Failed:`,e)}}window.handleGoogleLogin=fn;function pn(){let e=0,t=()=>{if(typeof google<`u`&&google.accounts&&google.accounts.id){google.accounts.id.initialize({client_id:window.globalGoogleClientId,callback:fn});let e=document.getElementById(`googleBtnContainer`);e&&google.accounts.id.renderButton(e,{theme:`outline`,size:`large`,shape:`pill`});return}++e<40&&setTimeout(t,250)};t()}async function mn(){x();try{let e=await(await Y(`/api/user-status`)).json();e.logged_in?(b.user=e.user,await X(),await Lt(),$t()):(b.user=null,Ft())}catch{}b.tripDays&&[...new Set(b.tripDays.map(e=>e.tripId))].forEach(e=>{b.tripDays.filter(t=>t.tripId===e).sort((e,t)=>e.dayNumber!=null&&t.dayNumber!=null?e.dayNumber-t.dayNumber:new Date(e.date).getTime()-new Date(t.date).getTime()).forEach((e,t)=>{e.dayNumber??=t+1})}),At(),rn(),ln(),q(nn(window.location.hash.replace(`#`,``)||e.HOME)),pn();let t=()=>{document.getElementById(`sidebar`)?.classList.toggle(`open`),document.getElementById(`sidebarOverlay`)?.classList.toggle(`open`)};document.getElementById(`hamburgerBtn`)?.addEventListener(`click`,t),document.getElementById(`sidebarOverlay`)?.addEventListener(`click`,t),document.getElementById(`sidebarClose`)?.addEventListener(`click`,t);let n=document.querySelector(`.nav-brand`);n&&(n.style.cursor=`pointer`,n.onclick=()=>q(`home`));let r=document.getElementById(`notificationBellBtn`),i=document.getElementById(`notificationDropdown`);r?.addEventListener(`click`,e=>{if(e.stopPropagation(),i){let e=i.style.display===`none`||!i.style.display;i.style.display=e?`flex`:`none`,e&&(sn(),en())}}),document.getElementById(`newTripBtn`)?.addEventListener(`click`,()=>{Te()}),document.getElementById(`sidebarLogoutBtn`)?.addEventListener(`click`,()=>Dt()),document.getElementById(`completeTripBtn`)?.addEventListener(`click`,un),document.getElementById(`deleteTripBtn`)?.addEventListener(`click`,dn),document.addEventListener(`click`,t=>{let n=t.target,a=n?.closest(`[data-notification-index]`);if(a){let e=parseInt(a.getAttribute(`data-notification-index`)??``,10),t=(b.notifications||[])[e];t&&cn(t);return}i&&i.style.display===`flex`&&!i.contains(n)&&n!==r&&(i.style.display=`none`);let o=n?.closest(`[data-page]`);o&&(t.preventDefault(),q(nn(o.getAttribute(`data-page`)??e.HOME)),document.getElementById(`sidebar`)?.classList.remove(`open`),document.getElementById(`sidebarOverlay`)?.classList.remove(`open`))}),setInterval(()=>{b.user&&(X(),$t())},15e3)}document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,mn):mn(),`serviceWorker`in navigator&&window.addEventListener(`load`,()=>{navigator.serviceWorker.register(`/sw.js`,{scope:`/`}).catch(e=>{console.warn(`[sw] registration failed`,e)})})})();
//# sourceMappingURL=app.bundle.js.map