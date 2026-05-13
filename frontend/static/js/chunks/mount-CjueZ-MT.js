import{r as e,t}from"./vendor-react-CYVQMBjw.js";import{B as n,E as r,F as i,H as a,J as o,K as s,O as c,Q as l,S as u,W as d,Y as f,Z as p,_ as m,a as h,at as g,g as _,it as v,j as y,k as b,n as x,r as S,rt as C,t as w,v as T}from"../app.bundle.js";var E=e();function D(e){if(!e)return``;let t=Array.isArray(e.items)?e.items.filter(Boolean):[];if(t.length>0)return`<ul class="ai-plan-block__list">${t.map(e=>O(e)).join(``)}</ul>`;if(e.description){let t=String(e.description).split(/\n+/).map(e=>e.trim()).filter(Boolean);return t.length>1?`<ul class="ai-plan-block__list">${t.map(e=>`<li>${o(e.replace(/^[-•*]\s*/,``))}</li>`).join(``)}</ul>`:`<div class="ai-plan-block__desc">${o(e.description)}</div>`}return``}function O(e){if(typeof e==`string`)return`<li class="ai-plan-block__item">${o(e)}</li>`;if(!e||typeof e!=`object`)return``;let t=e,n=String(t.text||``);if(!n)return``;if(t.verified&&t.placeId){let e=t.photoUrl?`<img class="ai-place-card__photo" src="${o(t.photoUrl)}" alt="" referrerpolicy="no-referrer" loading="lazy">`:`<div class="ai-place-card__photo ai-place-card__photo--empty" aria-hidden="true">📍</div>`,r=typeof t.rating==`number`?`<span class="ai-place-card__rating">★ ${t.rating.toFixed(1)}${t.userRatingsTotal?` <span class="ai-place-card__rating-count">(${k(t.userRatingsTotal)})</span>`:``}</span>`:``,i=t.address?`<span class="ai-place-card__address">${o(t.address)}</span>`:``,a=t.why?`<span class="ai-place-card__why">${o(t.why)}</span>`:``,s=t.fact?`<span class="ai-place-card__fact">✨ ${o(t.fact)}</span>`:``,c=t.mapsUrl||`https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(t.placeId)}`,l=t.verifiedName||n;return`
            <li class="ai-plan-block__item ai-plan-block__item--card">
                <a class="ai-place-card" href="${o(c)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${o(l)} on Google Maps">
                    ${e}
                    <div class="ai-place-card__body">
                        <span class="ai-place-card__name">${o(l)}</span>
                        ${r}
                        ${i}
                        ${a}
                        ${s}
                    </div>
                </a>
            </li>`}let r=t.why?`<span class="ai-place-card__why" style="margin-top:4px;">${o(t.why)}</span>`:``,i=t.fact?`<span class="ai-place-card__fact" style="margin-top:2px;">✨ ${o(t.fact)}</span>`:``;return`
        <li class="ai-plan-block__item ai-plan-block__item--unverified">
            <div style="display:flex; align-items:baseline; gap:6px; flex-wrap:wrap;">
                <span class="ai-plan-block__item-text">${o(n)}</span>
                <span class="ai-plan-block__unverified-chip" title="The Places lookup couldn't resolve this. Worth double-checking before adding to your plan.">unverified</span>
            </div>
            ${r}
            ${i}
        </li>`}function k(e){return!Number.isFinite(e)||e<0?``:e<1e3?String(e):e<1e6?`${(Math.round(e/100)/10).toFixed(1).replace(/\.0$/,``)}k`:`${(Math.round(e/1e5)/10).toFixed(1).replace(/\.0$/,``)}M`}function A(e){return typeof e==`string`?e:e&&typeof e==`object`&&typeof e.text==`string`?e.text:String(e??``)}function j(e){if(!e)return``;let t=Array.isArray(e.items)?e.items.filter(Boolean):[];return t.length>0?[e.activity?`${e.activity}:`:``,...t.map(e=>`- ${A(e)}`)].filter(Boolean).join(`
`):e.activity&&e.description?`${e.activity}: ${e.description}`:e.activity||e.description||``}var M=null,N=[];function P(){let e=document.createElement(`div`),t=v.trips.find(e=>e.id===v.activeTripId);if(!t)return e.innerHTML=`
            <div style="padding:32px 0 24px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',sans-serif;">
                <h1 style="margin:0 0 6px;font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;background:var(--gradient-title);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">${w(`ai.title`)}</h1>
                <p style="margin:0;color:var(--text-secondary);font-size:1rem;">Your AI-powered travel planner</p>
            </div>
            <div style="position: relative; width: 100%; height: calc(100vh - 200px); min-height: 480px; border-radius: 20px; overflow: hidden; box-shadow: 0 40px 100px rgba(0,0,0,0.15);">
                <div id="emptyMap" style="width:100%; height:100%;"></div>
                <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);z-index:1000;">
                    <div class="premium-glass-card" style="text-align:center;color:#002d5b;padding:48px;max-width:500px;background:rgba(255,255,255,0.6);border-radius:36px;border:1px solid rgba(255,255,255,0.8);box-shadow: 0 30px 60px rgba(0,0,0,0.1), 0 10px 20px rgba(0,0,0,0.05);">
                        <div style="font-size:4.5rem;margin-bottom:24px;filter:drop-shadow(0 10px 15px rgba(0,0,0,0.1));">🧭</div>
                        <h2 style="font-size:2rem;font-weight:800;margin-bottom:16px;letter-spacing:-0.03em;">${w(`ai.noTripTitle`)}</h2>
                        <p style="font-size:1.15rem;opacity:0.85;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;margin-bottom:32px;">${w(`ai.noTripBody`)}</p>
                        <button id="aiStartJourneyBtn" class="btn-primary btn-primary--lg" style="max-width: none; width: auto; padding: 16px 36px; font-size: 1.15rem;">+ Start Your Journey</button>
                    </div>
                </div>
            </div>`,setTimeout(()=>{e.querySelector(`#aiStartJourneyBtn`)?.addEventListener(`click`,()=>i()),typeof google<`u`&&google.maps&&C(new google.maps.Map(document.getElementById(`emptyMap`),{center:{lat:20,lng:0},zoom:2,minZoom:2,gestureHandling:d(),restriction:{latLngBounds:{north:85,south:-85,west:-180,east:180},strictBounds:!0},styles:[]}),[])},100),e;let u=t.country||``,E=(v.tripDays||[]).filter(e=>e.tripId===v.activeTripId&&e.dayNumber>0&&e.date).map(e=>e.date).sort(),O=v.expenses.filter(e=>e.tripId===v.activeTripId&&e.date).sort((e,t)=>e.date.localeCompare(t.date)).map(e=>e.date),k=t.dateFrom||E[0]||O[0]||``,A=t.dateTo||E[E.length-1]||O[O.length-1]||``,P=t.aiPlan||null,F=t.aiContext||``,I=t.aiNumDays||1,L=n(t),R=`font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',sans-serif;`;return e.innerHTML=`
        <div style="${R}">
            <!-- Header -->
            <div style="padding:32px 0 24px;">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
                    <h1 style="margin:0;font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;background:var(--gradient-title);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">${w(`ai.title`)}</h1>
                </div>
                <p style="margin:0;color:var(--text-secondary);font-size:1rem;">${w(`ai.subtitlePlanning`,{country:o(u)})}</p>
            </div>

            <!-- Top 2-col: Controls | Map. Class ai-page-2col is the
                 anchor for the mobile media query that collapses this
                 to a single column at 720px and below (the inline
                 380px + 1fr already exceeds a 375px viewport, which
                 is why the cards appeared cut off in the prior
                 build). -->
            <div class="ai-page-2col" style="display:grid;grid-template-columns:380px 1fr;gap:24px;margin-bottom:32px;">

                <!-- Left: Controls. min-height matches the sticky map (700px) so
                     the Requirements card can flex-grow into the spare space and
                     the Generate button bottom lines up with the map's bottom.
                     Mobile drops the min-height (see media query) so the cards
                     don't push a 700px-tall column into a 600px viewport. -->
                <div id="aiControlsPanel" style="display:flex;flex-direction:column;gap:16px;min-height:700px;">
                    <!-- AI Engine — Gemini key. Each user brings their
                         own free key so we don't burn the host's quota
                         when shipping to friends/family. The key is
                         persisted on STATE.geminiApiKey (localStorage
                         auto-flush via the saveState subscriber) and
                         sent in the /api/generate_itinerary request
                         body; backend falls back to its own env key
                         when the request body has none, so dev /
                         self-hosted setups still work. -->
                    <div class="card glass" style="padding:18px;border-color:rgba(155,89,182,0.3);flex:0 0 auto;">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                            <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.07em;color:#7c3a9e;margin:0;">${w(`ai.sectionAiEngine`)}</h2>
                            <button id="aiKeyHelpBtn" type="button" title="${w(`ai.keyHelpBtnTitle`)}" aria-label="${w(`ai.keyHelpBtnTitle`)}"
                                style="background:rgba(155,89,182,0.12); border:1px solid rgba(155,89,182,0.35); color:#7c3a9e; width:24px; height:24px; border-radius:50%; cursor:pointer; font-weight:800; font-size:0.78rem; line-height:1; display:inline-flex; align-items:center; justify-content:center; font-family: Georgia, serif; font-style: italic;">i</button>
                        </div>
                        <p style="color:var(--text-secondary);font-size:0.78rem;margin:0 0 10px;">${w(`ai.keyCardSubtitle`)}</p>
                        <div style="position:relative;">
                            <input id="aiKeyInput" type="password" placeholder="${w(`ai.keyInputPlaceholder`)}" autocomplete="off" spellcheck="false"
                                value="${o(v.geminiApiKey||``)}"
                                style="width:100%; box-sizing:border-box; padding:10px 42px 10px 12px; border:1px solid rgba(0,0,0,0.12); border-radius:10px; font-size:0.85rem; font-family: 'SF Mono', monospace; background:white; color:#002d5b;">
                            <button id="aiKeyToggleBtn" type="button" title="${w(`ai.keyToggleTitle`)}" aria-label="${w(`ai.keyToggleAriaLabel`)}"
                                style="position:absolute; right:6px; top:50%; transform:translateY(-50%); background:transparent; border:0; cursor:pointer; padding:4px 8px; color:rgba(0,0,0,0.5); font-size:0.95rem; line-height:1;">👁</button>
                        </div>
                        <div id="aiKeyStatus" style="margin-top:6px; font-size:0.7rem; font-weight:700; min-height:1em;"></div>
                    </div>
                    <!-- Dates -->
                    <div class="card glass" style="padding:20px;flex:0 0 auto;">
                        <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.07em;color:#005bb8;margin-bottom:14px;">${w(`ai.sectionTravelDates`)}</h2>
                        <div style="display:flex; flex-direction:column; gap:12px;">
                            <div>
                                <label for="aiDateFrom" style="display:block;font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;">${w(`ai.dateFromLabel`)}</label>
                                <input id="aiDateFrom" type="date" class="glass-input" value="${k}" style="width:100%; box-sizing: border-box;">
                            </div>
                            <div>
                                <label for="aiDateTo" style="display:block;font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;">${w(`ai.dateToLabel`)}</label>
                                <input id="aiDateTo" type="date" class="glass-input" value="${A}" style="width:100%; box-sizing: border-box;" min="${k}">
                            </div>
                            <p id="aiDateHint" style="margin:0; font-size:0.74rem; color:var(--text-secondary); line-height:1.45;">${w(`ai.dateHint`)}</p>
                        </div>
                    </div>

                    <div class="card glass" style="padding:20px;flex:1 1 auto;display:flex;flex-direction:column;min-height:0;">
                        <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;color:#005bb8;margin-bottom:10px;letter-spacing:0.05em;">${w(`ai.sectionRequirements`)}</h2>
                        <textarea id="aiExtraContext" class="glass-input" style="width:100%; resize:none; font-size:0.9rem; box-sizing: border-box; flex:1 1 auto; min-height:120px;" placeholder="e.g. Vegetarian friendly, no walking more than 2km...">${F}</textarea>
                    </div>
                    <!-- Generate -->
                    ${L?`<button id="generateBtn" class="ai-generate-btn" style="width:100%; border-radius: var(--radius-lg);flex:0 0 auto;">${w(`ai.generateBtn`)}</button>`:(()=>{let e=a(t);return`<div class="card glass" style="padding:16px; border-radius: var(--radius-lg); text-align:center; color: var(--text-secondary); font-size: 0.85rem; flex:0 0 auto;">
                                ${w(`ai.roleNotice`,{role:w(e===`budgeteer`?`ai.roleBudgeteer`:e===`relaxer`?`ai.roleRelaxer`:`ai.roleObserver`),note:w(e===`budgeteer`?`ai.roleNoteBudgeteer`:`ai.roleNoteOther`)})}
                            </div>`})()}
                </div>

                <!-- Right: Google Map (sticky) -->
                <div style="position:sticky;top:80px;height:700px;">
                    <div class="card glass" style="padding:0;overflow:hidden;height:100%;border-radius:18px;position:relative;">
                        <div id="aiGoogleMap" style="width:100%;height:100%;"></div>
                        <div id="aiZoomBadge" style="position:absolute;bottom:14px;left:14px;z-index:1000;">
                            <span>📍</span> <span>${u}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- To-do list panel (full-width below) — surfaces the
                 trip's unified to-do list (places stamped from the home
                 map InfoWindow with "Add to to-do"). Each row is a
                 checkbox bound to the place's forAI flag: ticked = the
                 AI generation request includes this place; unticked =
                 the place stays on the to-do list but isn't sent to
                 Gemini. New places ship pre-ticked so the common case
                 ("yes, consider this place") needs zero clicks. Day
                 and time-of-day dropdowns appear when dates are set
                 above — that's when assignments make sense.
                 Generate (further below) reads forAI from this panel. -->
            <div id="aiTodoListPanel" style="margin-bottom: 32px;"></div>

            <!-- Itinerary Output (full-width below) -->
            <div id="itineraryOutput" style="margin-bottom: 60px;"></div>
        </div>`,setTimeout(()=>{let n=e.querySelector(`#aiDateFrom`),i=e.querySelector(`#aiDateTo`),a=e.querySelector(`#aiDateHint`);if(n&&i){let e=a?.textContent||``,t=a?.style.color||``,r=()=>{i.min=n.value||``,n.value&&i.value&&i.value<n.value?(a&&(a.textContent=`End date must be on or after the start date.`,a.style.color=`#a82424`),i.setCustomValidity(`End date must be on or after the start date.`)):(a&&(a.textContent=e,a.style.color=t),i.setCustomValidity(``))};n.addEventListener(`change`,r),i.addEventListener(`change`,r),r()}let E=e=>{if(!M)return;let n=t.id+`_ai`;if(v.mapViews&&v.mapViews[n]){let e=v.mapViews[n];M.setCenter({lat:e.lat,lng:e.lng}),M.setZoom(e.zoom);return}if(t.viewport){let e=t.viewport;M.fitBounds(new google.maps.LatLngBounds({lat:e.south,lng:e.west},{lat:e.north,lng:e.east}));return}let r=e.replace(/\(USA\)/g,``).trim();r.includes(` - `)&&(r=r.split(` - `)[1]+`, USA`),new google.maps.Geocoder().geocode({address:r},(e,t)=>{t===`OK`&&e[0]&&M.fitBounds(e[0].geometry.viewport)})};if(typeof google<`u`&&google.maps){let n=document.getElementById(`aiGoogleMap`);n&&(M=new google.maps.Map(n,{center:{lat:20,lng:0},zoom:2,minZoom:2,mapTypeId:`roadmap`,disableDefaultUI:!0,gestureHandling:d(),restriction:{latLngBounds:{north:85,south:-85,west:-180,east:180},strictBounds:!0},styles:[]}),C(M,[]),E(u),M.addListener(`idle`,()=>{let e=t.id+`_ai`;v.mapViews||={};let n=M.getCenter();v.mapViews[e]={lat:n.lat(),lng:n.lng(),zoom:M.getZoom()},g(`state:changed`)}));let r=e.querySelector(`#aiZoomBadge`);r&&(r.onclick=()=>{let e=t.id+`_ai`;v.mapViews&&v.mapViews[e]&&delete v.mapViews[e],E(u)})}let O=P,k=(n,i,a)=>{let s=p(e,`#itineraryOutput`);if(!n||!n.length){s.innerHTML=``;return}s.innerHTML=`
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
                    <div>
                        <!-- Phase G UX: text colour switched from white to a
                             blue→purple gradient (matching the day-chip vibe)
                             so the headline reads clearly against the light
                             page background AND ties visually to the day
                             cards below. -->
                        <h2 style="margin:0;font-size:2rem;font-weight:800;letter-spacing:-0.03em;background:var(--gradient-title);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;${R}">${w(`ai.resultHeading`,{numDays:i,country:a})}</h2>
                        <p style="color:var(--text-secondary);margin:6px 0 0;font-size:0.9rem;">${w(`ai.resultGeneratedBy`)}</p>
                    </div>
                    <div style="font-size:0.78rem;color:var(--text-secondary);background:var(--glass-bg);border:1px solid var(--glass-border);padding:5px 14px;border-radius:980px;">${w(`ai.resultBadge`)}</div>
                </div>
                <div id="itineraryDays" style="display:flex;flex-direction:column;gap:16px;"></div>
                ${L?`<div style="display:flex;gap:12px;margin-top:24px;"><button id="acceptPlanBtn" class="btn" style="flex:2;background:var(--accent-blue);color:white;padding:16px;font-size:1.1rem;border-radius:16px;font-weight:700;box-shadow:0 10px 20px rgba(0,122,255,0.2);cursor:pointer;">${w(`ai.acceptPlanBtn`)}</button></div>`:``}`;let l=p(s,`#itineraryDays`),u=[];if(n.forEach((e,t)=>{let n=document.createElement(`div`);n.className=`card glass`,n.style.cssText=`border-radius:18px;overflow:hidden;transition:box-shadow 0.3s,border-color 0.3s;${R}`,n.innerHTML=`
                    <div class="ai-day-row" style="display:flex;align-items:stretch;">
                        <div class="ai-day-chip">
                            <span style="color:rgba(255,255,255,0.7);font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Day</span>
                            <span style="color:white;font-size:2rem;font-weight:800;line-height:1;">${e.day}</span>
                        </div>
                        <div class="ai-day-body" style="flex:1;padding:var(--space-6) 28px;">
                            <div style="margin-bottom:var(--space-5);">
                                <!-- Phase G UX: was color:white which is invisible against
                                     the .card.glass white surface this row sits in. Switching
                                     to --text-primary (dark on light) restores legibility
                                     without touching the day-chip on the left, which retains
                                     its dark gradient + white glyph. -->
                                <h3 style="margin:0 0 var(--space-1);font-size:1.2rem;font-weight:700;letter-spacing:-0.02em;color:var(--text-primary);">${e.title||`Day `+e.day}</h3>
                                <span style="font-size:var(--font-base);color:var(--text-secondary);">${e.date||``}</span>
                            </div>
                            <div class="ai-day-slots" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-4);">
                                <div class="ai-plan-block" style="--accent: 0,113,227;">
                                    <div class="ai-plan-block__tag">🌅 Morning</div>
                                    <div class="ai-plan-block__title">${o(e.morning?.activity||``)}</div>
                                    ${D(e.morning)}
                                </div>
                                <div class="ai-plan-block" style="--accent: 255,149,0;">
                                    <div class="ai-plan-block__tag">☀️ Afternoon</div>
                                    <div class="ai-plan-block__title">${o(e.afternoon?.activity||``)}</div>
                                    ${D(e.afternoon)}
                                </div>
                                <div class="ai-plan-block" style="--accent: 155,89,182;">
                                    <div class="ai-plan-block__tag">🌙 Evening</div>
                                    <div class="ai-plan-block__title">${o(e.evening?.activity||``)}</div>
                                    ${D(e.evening)}
                                </div>
                            </div>
                            <!-- 💡 Pro Tip block was removed app-wide
                                 (per user) — AI itineraries used to
                                 ship a per-day tip line; no more. -->

                        </div>
                    </div>`,l.appendChild(n),u.push(n)}),M){N.forEach(e=>e.setMap(null)),N=[];let e=new google.maps.LatLngBounds,t=new google.maps.Geocoder,r=(n,r)=>{let i=n.mainLocation||n.title||a;!n.mainLocation&&n.title&&(i=n.title.replace(/Exploring |Day Trip to |Visit |Touring |Arrival in |Departure from |Day \d+:? /gi,``).trim()),t.geocode({address:i+`, `+a},(t,i)=>{if(i===`OK`&&t[0]){let i=t[0].geometry.location;n.lat=i.lat(),n.lon=i.lng();let a=new google.maps.Marker({position:i,map:M,label:{text:String(n.day),color:`white`,fontWeight:`800`},icon:{path:google.maps.SymbolPath.CIRCLE,scale:16,fillColor:`#0071e3`,fillOpacity:1,strokeWeight:2,strokeColor:`white`}});a.addListener(`click`,()=>{u.forEach(e=>{e.style.boxShadow=``,e.style.borderColor=``});let e=u[r];e&&(e.style.boxShadow=`0 0 0 3px var(--accent-blue), 0 8px 32px rgba(0,113,227,0.25)`,e.style.borderColor=`var(--accent-blue)`,e.scrollIntoView({behavior:`smooth`,block:`center`}))}),N.push(a),e.extend(i),N.length>0&&M.fitBounds(e)}})};n.forEach((e,t)=>setTimeout(()=>r(e,t),t*500))}let d=document.getElementById(`acceptPlanBtn`);d&&(d.onclick=()=>{if(!n)return;let e=v.tripDays.filter(e=>e.tripId===t.id&&e.dayNumber>0);v.tripDays=v.tripDays.filter(e=>!(e.tripId===t.id&&e.dayNumber>0)),e.forEach(e=>h(e.id)),c(t),n.forEach((e,n)=>{let i=e.date||new Date().toISOString().split(`T`)[0],a=`day_`+Date.now()+`_`+n,o={id:a,tripId:t.id,date:i,name:e.title||`Day ${n+1}`,dayNumber:n+1,lat:e.lat,lng:e.lon,photos:[],tickets:[],notes:``,plan:{morning:j(e.morning),afternoon:j(e.afternoon),evening:j(e.evening)}};v.tripDays.push(o),_(o);let s=[[`morning`,e.morning],[`afternoon`,e.afternoon],[`evening`,e.evening]];for(let[e,n]of s){let i=Array.isArray(n?.items)?n.items:[];for(let n of i)r(t,n,a,e)}}),m(t),g(`state:changed`),d.innerHTML=`✓ Plan Accepted! (View in Home)`,d.style.background=`#34c759`,d.disabled=!0})},A=()=>{let n=e.querySelector(`#aiTodoListPanel`);if(!n)return;let r=b(t).filter(e=>e.forManual),i=r.filter(e=>e.forAI);if(r.length===0){n.innerHTML=`
                    <div class="card glass" style="padding: 20px; border-radius: 18px; border: 1.5px dashed rgba(155, 89, 182, 0.35); background: rgba(155, 89, 182, 0.04);">
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
                            <span style="font-size: 1.2rem;">📋</span>
                            <h3 style="margin:0; color:#7c3a9e; font-weight:800; letter-spacing:-0.01em;">${w(`ai.todoPanelEmptyTitle`)}</h3>
                        </div>
                        <p style="margin:0 0 12px; color: var(--text-secondary); font-size: 0.9rem;">${w(`ai.todoPanelEmptyBody`)}</p>
                        <button id="aiGoToTodoBtn" class="btn-primary" style="padding: 10px 18px; border-radius: 999px; font-size:0.85rem;">${w(`ai.todoPanelEmptyCta`)}</button>
                    </div>
                `,n.querySelector(`#aiGoToTodoBtn`)?.addEventListener(`click`,()=>T(`todo`));return}if(i.length===0){n.innerHTML=`
                    <div class="card glass" style="padding: 20px; border-radius: 18px; border: 1.5px dashed rgba(155, 89, 182, 0.35); background: rgba(155, 89, 182, 0.04);">
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
                            <span style="font-size: 1.2rem;">📋</span>
                            <h3 style="margin:0; color:#7c3a9e; font-weight:800; letter-spacing:-0.01em;">${x(`ai.todoPanelNoneTickedTitle`,r.length)}</h3>
                        </div>
                        <p style="margin:0 0 12px; color: var(--text-secondary); font-size: 0.9rem;">${w(`ai.todoPanelNoneTickedBody`)}</p>
                        <button id="aiGoToTodoBtn" class="btn-primary" style="padding: 10px 18px; border-radius: 999px; font-size:0.85rem;">${w(`ai.todoPanelNoneTickedCta`)}</button>
                    </div>
                `,n.querySelector(`#aiGoToTodoBtn`)?.addEventListener(`click`,()=>T(`todo`));return}let a=e.querySelector(`#aiDateFrom`),s=e.querySelector(`#aiDateTo`),c=!!(a?.value&&s?.value),l=(v.tripDays||[]).filter(e=>e.tripId===t.id&&e.dayNumber>0).sort((e,t)=>e.dayNumber-t.dayNumber),u=e=>`
                <option value="" ${e?``:`selected`}>${w(`ai.dayOptionAny`)}</option>
                ${l.map(t=>`
                    <option value="${o(t.id)}" ${t.id===e?`selected`:``}>
                        ${w(`ai.dayOptionDay`,{num:t.dayNumber})}${t.date?` — ${f(t.date)||t.date}`:``}
                    </option>
                `).join(``)}
            `,d=e=>`
                <option value="" ${e?``:`selected`}>${w(`ai.timeOptionAny`)}</option>
                <option value="morning"   ${e===`morning`?`selected`:``}>${w(`ai.timeOptionMorning`)}</option>
                <option value="afternoon" ${e===`afternoon`?`selected`:``}>${w(`ai.timeOptionAfternoon`)}</option>
                <option value="evening"   ${e===`evening`?`selected`:``}>${w(`ai.timeOptionEvening`)}</option>
            `,p=i.map(e=>`
                <div class="ai-marked-card" data-place-id="${o(e.placeId)}" style="background:white; border:1.5px solid ${e.color}; border-radius:14px; padding:14px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); display:flex; flex-direction:column; gap:10px; min-height: 0;">
                    <div style="display:flex; align-items:flex-start; gap:10px;">
                        <span style="font-size:1.4rem; line-height:1;">${e.icon}</span>
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight:800; color:#002d5b; font-size:0.95rem; line-height:1.25;">${o(e.name)}</div>
                            ${e.address?`<div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">${o(e.address)}</div>`:``}
                        </div>
                    </div>
                    ${c?`
                        <div style="display:flex; gap:8px; min-width:0;">
                            <select class="marked-day-select" data-place-id="${o(e.placeId)}" style="flex:1 1 0; min-width:0; max-width:100%; padding:6px 8px; border-radius:8px; border:1px solid rgba(0,0,0,0.1); font-size:0.78rem; background:white;">
                                ${u(e.dayId)}
                            </select>
                            <select class="marked-time-select" data-place-id="${o(e.placeId)}" style="flex:1 1 0; min-width:0; max-width:100%; padding:6px 8px; border-radius:8px; border:1px solid rgba(0,0,0,0.1); font-size:0.78rem; background:white;">
                                ${d(e.timeOfDay)}
                            </select>
                        </div>
                    `:`
                        <div style="font-size:0.75rem; color:var(--text-secondary); font-style:italic;">${w(`ai.todoPanelCardNoDates`)}</div>
                    `}
                </div>
            `).join(``);n.innerHTML=`
                <div class="card glass" style="padding:20px; border-radius:18px; border: 1.5px solid rgba(155, 89, 182, 0.25);">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap;">
                        <span style="font-size: 1.2rem;">📋</span>
                        <h3 style="margin:0; color:#7c3a9e; font-weight:800; letter-spacing:-0.01em;">${w(`ai.todoPanelTickedTitle`)} <span style="background:rgba(155,89,182,0.12); color:#7c3a9e; font-size:0.7rem; padding:2px 8px; border-radius:999px; margin-left:6px;">${x(`ai.todoPanelTickedCount`,i.length)}</span></h3>
                        <button id="aiManageTodoBtn" type="button" style="margin-left:auto; background:transparent; border:0; color:#005bb8; font-weight:700; font-size:0.82rem; cursor:pointer; padding:0;">${w(`ai.todoPanelManageBtn`)}</button>
                    </div>
                    <p style="font-size:0.82rem; color:var(--text-secondary); margin:0 0 12px; line-height:1.5;">${w(c?`ai.todoPanelHintWithDates`:`ai.todoPanelHintNoDates`)}</p>
                    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap:12px;">
                        ${p}
                    </div>
                </div>
            `,n.querySelector(`#aiManageTodoBtn`)?.addEventListener(`click`,()=>T(`todo`)),n.querySelectorAll(`.marked-day-select, .marked-time-select`).forEach(e=>{e.onchange=()=>{let r=e.dataset.placeId;if(!r)return;let i=n.querySelector(`.ai-marked-card[data-place-id="${r}"]`);if(!i)return;let a=i.querySelector(`.marked-day-select`),o=i.querySelector(`.marked-time-select`);y(t,r,a?.value||null,o?.value||null),g(`state:changed`),m(t)}})};A(),O&&k(O,I,u);let F=e.querySelector(`#aiExtraContext`);F&&(F.oninput=e=>{t.aiContext=e.target.value,g(`state:changed`)});let z=e.querySelector(`#aiKeyInput`),B=e.querySelector(`#aiKeyToggleBtn`),V=e.querySelector(`#aiKeyHelpBtn`),H=e.querySelector(`#aiKeyStatus`),U=()=>{if(!H)return;let e=(v.geminiApiKey||``).trim();if(!e){H.textContent=w(`ai.keyStatusEmpty`),H.style.color=`#a85d00`;return}let t=e.startsWith(`AIza`)&&e.length>=30;H.textContent=t?`✓ Key saved on this device.`:`⚠ Saved, but the format looks off (Gemini keys usually start with "AIza"). Click i for help.`,H.style.color=t?`#1a6b3c`:`#a85d00`};U(),z&&z.addEventListener(`input`,()=>{v.geminiApiKey=z.value,g(`state:changed`),U()}),B&&z&&B.addEventListener(`click`,()=>{let e=z.type===`text`;z.type=e?`password`:`text`,B.textContent=e?`👁`:`🙈`,B.title=w(e?`ai.keyToggleShow`:`ai.keyToggleHide`)}),V&&V.addEventListener(`click`,()=>{let{root:e,close:t}=s({cardClass:`card glass`,cardStyle:`width: 520px; max-width: calc(100vw - 32px); max-height: 90vh; overflow-y: auto; padding: 28px 32px; border-radius: 28px; background: white;`,innerHTML:`
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 12px;">
                            <h2 style="margin:0; font-size: 1.6rem; color:#7c3a9e; font-weight: 800; letter-spacing:-0.02em;">${w(`ai.keyHelpModalTitle`)}</h2>
                            <button id="aiKeyHelpClose" class="close-x-btn" aria-label="${w(`common.close`)}">✕</button>
                        </div>
                        <p style="margin:0 0 14px; color: var(--text-secondary); font-size: 0.92rem; line-height: 1.5;">
                            ${w(`ai.keyHelpModalIntro`)}
                        </p>
                        <ol style="margin: 0 0 16px 0; padding-left: 22px; color: #002d5b; font-size: 0.92rem; line-height: 1.7;">
                            <li>${w(`ai.keyHelpStepOpenLink`)}</li>
                            <li>${w(`ai.keyHelpStepSignIn`)}</li>
                            <li>${w(`ai.keyHelpStepCreate`)}</li>
                            <li>${w(`ai.keyHelpStepProject`)}</li>
                            <li>${w(`ai.keyHelpStepCopy`)}</li>
                            <li>${w(`ai.keyHelpStepPaste`)}</li>
                        </ol>
                        <div style="background: rgba(155,89,182,0.06); border:1px solid rgba(155,89,182,0.18); border-radius: 14px; padding: 12px 14px; font-size: 0.82rem; color: #002d5b; line-height: 1.55;">
                            <strong>${w(`ai.keyHelpWhatForTitle`)}</strong> ${w(`ai.keyHelpWhatForBody`)}
                        </div>
                        <!-- Free-tier limits. Google no longer publishes
                             fixed numbers on the docs page — they're
                             per-account and rotate based on tier /
                             usage / region — so we describe the shape
                             of the limits and link out to the live
                             dashboard rather than make up specifics. -->
                        <div style="margin-top: 12px; background: rgba(52,199,89,0.06); border:1px solid rgba(52,199,89,0.22); border-radius: 14px; padding: 12px 14px; font-size: 0.82rem; color: #002d5b; line-height: 1.55;">
                            <strong style="color:#1a6b3c;">${w(`ai.keyHelpHowManyTitle`)}</strong>
                            <p style="margin:6px 0 0;">
                                ${w(`ai.keyHelpHowManyBody`)}
                            </p>
                            <div style="margin-top:8px;"><strong style="color:#1a6b3c;">${w(`ai.keyHelpBucketsTitle`)}</strong>
                                <ul style="margin: 4px 0 0; padding-left: 18px;">
                                    <li>${w(`ai.keyHelpBucketMinute`)}</li>
                                    <li>${w(`ai.keyHelpBucketDay`)}</li>
                                </ul>
                            </div>
                            <div style="margin-top:8px;">
                                ${w(`ai.keyHelpRateLimitTip`)}
                            </div>
                            <div style="margin-top:8px; font-size: 0.78rem;">
                                ${w(`ai.keyHelpDashboardLink`)}
                            </div>
                        </div>
                        <div style="display:flex; justify-content:flex-end; margin-top:18px;">
                            <button id="aiKeyHelpDone" class="btn-primary" style="padding: 10px 22px; border-radius: 999px;">${w(`ai.keyHelpDoneBtn`)}</button>
                        </div>
                    `});e.querySelector(`#aiKeyHelpClose`)?.addEventListener(`click`,t),e.querySelector(`#aiKeyHelpDone`)?.addEventListener(`click`,t)}),[`#aiDateFrom`,`#aiDateTo`].forEach(t=>{let n=e.querySelector(t);n&&n.addEventListener(`change`,()=>A())});let W=e.querySelector(`#generateBtn`),G=async()=>{let n=p(e,`#itineraryOutput`),r=p(e,`#aiDateFrom`).value,i=p(e,`#aiDateTo`).value,a=document.getElementById(`aiExtraContext`)?.value??``;if(!r||!i){l(w(`ai.toastPickDates`));return}if(i<r){l(w(`ai.toastEndBeforeStart`));return}let s=new Date(r),c=new Date(i),d=Math.max(1,Math.round((c.getTime()-s.getTime())/864e5)+1),f=b(t).filter(e=>e.forAI&&e.forManual),m=``;if(f.length>0){let e=(v.tripDays||[]).filter(e=>e.tripId===t.id&&e.dayNumber>0),n=t=>e.find(e=>e.id===t)?.dayNumber;m=`\n\nThe user has marked these specific places to include in the itinerary. Please incorporate them where they fit, respecting any day/time assignments where given:\n${f.map(e=>{let t=e.dayId?n(e.dayId):null,r=t?`, on Day ${t}`:``,i=e.timeOfDay?`, ${e.timeOfDay}`:``,a=e.address?` (${e.address})`:``;return`- ${e.name}${a}${r}${i}`}).join(`
`)}`}let h=a+m;t.aiContext=a,t.aiNumDays=d,g(`state:changed`),n.innerHTML=`<div style="text-align:center;padding:60px;"><div class="spinner-ring" style="width:40px;height:40px;border:3px solid rgba(0,113,227,0.15);border-top-color:#005bb8;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 20px;"></div><div style="color:var(--text-primary);font-weight:600;">${w(`ai.loadingTitle`)}</div><div style="color:var(--text-secondary);font-size:0.82rem;margin-top:6px;">${w(`ai.loadingBody`)}</div></div>`,n.scrollIntoView({behavior:`smooth`});let _=W?.innerHTML||``;W&&(W.disabled=!0,W.innerHTML=w(`ai.generatingBtn`));try{let e=await(await S(`/api/generate_itinerary`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({destination:u,numDays:d,dateFrom:r,dateTo:i,context:h,gemini_key:(v.geminiApiKey||``).trim()})})).json();if(e.error)throw Error(e.error);O=e.itinerary,O==null?delete t.aiPlan:t.aiPlan=O,g(`state:changed`),k(O,d,u),n.scrollIntoView({behavior:`smooth`})}catch(e){let t=e.message||``,r=w(`ai.errorGeneric`),i=``;/UNAVAILABLE|503|overloaded/i.test(t)?(r=w(`ai.errorOverloaded`),i=w(`ai.errorOverloadedHint`)):/quota|limit|RESOURCE_EXHAUSTED|429/i.test(t)?(r=w(`ai.errorQuota`),i=w(`ai.errorQuotaHint`)):/key|api[_ ]?key|UNAUTHENTICATED|401|403/i.test(t)?(r=w(`ai.errorBadKey`),i=w(`ai.errorBadKeyHint`)):/network|fetch|timed?[\- ]?out|ECONN/i.test(t)&&(r=w(`ai.errorNetwork`),i=w(`ai.errorNetworkHint`)),n.innerHTML=`
                    <div class="card glass" style="text-align:center;padding:32px 28px;">
                        <div style="font-size:2.4rem;margin-bottom:8px;">😬</div>
                        <h2 style="color:#a82424;margin:0 0 6px;font-size:1.2rem;">${o(r)}</h2>
                        ${i?`<p style="margin:0 0 18px;color:var(--text-secondary);font-size:0.9rem;line-height:1.5;">${o(i)}</p>`:``}
                        <details style="margin:0 0 18px;text-align:left;background:rgba(255,59,48,0.04);border:1px solid rgba(255,59,48,0.16);border-radius:10px;padding:8px 12px;">
                            <summary style="cursor:pointer;font-size:0.78rem;font-weight:700;color:#7c3a9e;">${w(`ai.errorTechnicalDetails`)}</summary>
                            <pre style="margin:8px 0 0;font-size:0.72rem;color:#666;font-family:monospace;white-space:pre-wrap;word-break:break-word;">${o(t||w(`ai.errorUnknown`))}</pre>
                        </details>
                        <button id="aiRetryBtn" type="button" style="padding:10px 22px;border-radius:999px;border:0;background:var(--accent-blue);color:white;font-size:0.92rem;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(0,113,227,0.28);">${w(`ai.errorRetryBtn`)}</button>
                    </div>
                `,l(r),n.querySelector(`#aiRetryBtn`)?.addEventListener(`click`,()=>G())}finally{W&&(W.disabled=!1,W.innerHTML=_)}};W?.addEventListener(`click`,G)},0),e}var F=t();function I(){let e=(0,E.useRef)(null);return(0,E.useEffect)(()=>{let t=e.current;t&&(t.innerHTML=``,t.appendChild(P()))},[]),(0,F.jsx)(`div`,{ref:e})}function L(e){u(e,(0,E.createElement)(I))}export{L as mountAI};
//# sourceMappingURL=mount-CjueZ-MT.js.map