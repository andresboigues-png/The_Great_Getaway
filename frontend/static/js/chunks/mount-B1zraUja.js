import{r as e,t}from"./vendor-react-CYVQMBjw.js";import{$ as n,A as r,B as i,D as a,G as o,O as s,P as c,Q as l,R as u,T as d,W as f,Y as p,Z as m,_ as h,a as g,et as _,g as v,h as y,n as b,r as x,t as S,tt as C,x as w}from"../app.bundle.js";var T=e();function E(e){if(!e)return``;let t=Array.isArray(e.items)?e.items.filter(Boolean):[];if(t.length>0)return`<ul class="ai-plan-block__list">${t.map(e=>D(e)).join(``)}</ul>`;if(e.description){let t=String(e.description).split(/\n+/).map(e=>e.trim()).filter(Boolean);return t.length>1?`<ul class="ai-plan-block__list">${t.map(e=>`<li>${f(e.replace(/^[-•*]\s*/,``))}</li>`).join(``)}</ul>`:`<div class="ai-plan-block__desc">${f(e.description)}</div>`}return``}function D(e){if(typeof e==`string`)return`<li class="ai-plan-block__item">${f(e)}</li>`;if(!e||typeof e!=`object`)return``;let t=e,n=String(t.text||``);if(!n)return``;if(t.verified&&t.placeId){let e=t.photoUrl?`<img class="ai-place-card__photo" src="${f(t.photoUrl)}" alt="" referrerpolicy="no-referrer" loading="lazy">`:`<div class="ai-place-card__photo ai-place-card__photo--empty" aria-hidden="true">📍</div>`,r=typeof t.rating==`number`?`<span class="ai-place-card__rating">★ ${t.rating.toFixed(1)}${t.userRatingsTotal?` <span class="ai-place-card__rating-count">(${O(t.userRatingsTotal)})</span>`:``}</span>`:``,i=t.address?`<span class="ai-place-card__address">${f(t.address)}</span>`:``,a=t.why?`<span class="ai-place-card__why">${f(t.why)}</span>`:``,o=t.fact?`<span class="ai-place-card__fact">✨ ${f(t.fact)}</span>`:``,s=t.mapsUrl||`https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(t.placeId)}`,c=t.verifiedName||n;return`
            <li class="ai-plan-block__item ai-plan-block__item--card">
                <a class="ai-place-card" href="${f(s)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${f(c)} on Google Maps">
                    ${e}
                    <div class="ai-place-card__body">
                        <span class="ai-place-card__name">${f(c)}</span>
                        ${r}
                        ${i}
                        ${a}
                        ${o}
                    </div>
                </a>
            </li>`}let r=t.why?`<span class="ai-place-card__why" style="margin-top:4px;">${f(t.why)}</span>`:``,i=t.fact?`<span class="ai-place-card__fact" style="margin-top:2px;">✨ ${f(t.fact)}</span>`:``;return`
        <li class="ai-plan-block__item ai-plan-block__item--unverified">
            <div style="display:flex; align-items:baseline; gap:6px; flex-wrap:wrap;">
                <span class="ai-plan-block__item-text">${f(n)}</span>
                <span class="ai-plan-block__unverified-chip" title="The Places lookup couldn't resolve this. Worth double-checking before adding to your plan.">unverified</span>
            </div>
            ${r}
            ${i}
        </li>`}function O(e){return!Number.isFinite(e)||e<0?``:e<1e3?String(e):e<1e6?`${(Math.round(e/100)/10).toFixed(1).replace(/\.0$/,``)}k`:`${(Math.round(e/1e5)/10).toFixed(1).replace(/\.0$/,``)}M`}function k(e){return typeof e==`string`?e:e&&typeof e==`object`&&typeof e.text==`string`?e.text:String(e??``)}function A(e){if(!e)return``;let t=Array.isArray(e.items)?e.items.filter(Boolean):[];return t.length>0?[e.activity?`${e.activity}:`:``,...t.map(e=>`- ${k(e)}`)].filter(Boolean).join(`
`):e.activity&&e.description?`${e.activity}: ${e.description}`:e.activity||e.description||``}var j=null,M=[];function N(){let e=document.createElement(`div`),t=_.trips.find(e=>e.id===_.activeTripId);if(!t)return e.innerHTML=`
            <div style="padding:32px 0 24px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',sans-serif;">
                <h1 style="margin:0 0 6px;font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;background:var(--gradient-title);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">${S(`ai.title`)}</h1>
                <p style="margin:0;color:var(--text-secondary);font-size:1rem;">Your AI-powered travel planner</p>
            </div>
            <div style="position: relative; width: 100%; height: calc(100vh - 200px); min-height: 480px; border-radius: 20px; overflow: hidden; box-shadow: 0 40px 100px rgba(0,0,0,0.15);">
                <div id="emptyMap" style="width:100%; height:100%;"></div>
                <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);z-index:1000;">
                    <div class="premium-glass-card" style="text-align:center;color:#002d5b;padding:48px;max-width:500px;background:rgba(255,255,255,0.6);border-radius:36px;border:1px solid rgba(255,255,255,0.8);box-shadow: 0 30px 60px rgba(0,0,0,0.1), 0 10px 20px rgba(0,0,0,0.05);">
                        <div style="font-size:4.5rem;margin-bottom:24px;filter:drop-shadow(0 10px 15px rgba(0,0,0,0.1));">🧭</div>
                        <h2 style="font-size:2rem;font-weight:800;margin-bottom:16px;letter-spacing:-0.03em;">${S(`ai.noTripTitle`)}</h2>
                        <p style="font-size:1.15rem;opacity:0.85;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;margin-bottom:32px;">${S(`ai.noTripBody`)}</p>
                        <button id="aiStartJourneyBtn" class="btn-primary btn-primary--lg" style="max-width: none; width: auto; padding: 16px 36px; font-size: 1.15rem;">+ Start Your Journey</button>
                    </div>
                </div>
            </div>`,setTimeout(()=>{e.querySelector(`#aiStartJourneyBtn`)?.addEventListener(`click`,()=>c()),typeof google<`u`&&google.maps&&n(new google.maps.Map(document.getElementById(`emptyMap`),{center:{lat:20,lng:0},zoom:2,minZoom:2,restriction:{latLngBounds:{north:85,south:-85,west:-180,east:180},strictBounds:!0},styles:[]}),[])},100),e;let w=t.country||``,T=(_.tripDays||[]).filter(e=>e.tripId===_.activeTripId&&e.dayNumber>0&&e.date).map(e=>e.date).sort(),D=_.expenses.filter(e=>e.tripId===_.activeTripId&&e.date).sort((e,t)=>e.date.localeCompare(t.date)).map(e=>e.date),O=t.dateFrom||T[0]||D[0]||``,k=t.dateTo||T[T.length-1]||D[D.length-1]||``,N=t.aiPlan||null,P=t.aiContext||``,F=t.aiNumDays||1,I=u(t),L=`font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',sans-serif;`;return e.innerHTML=`
        <div style="${L}">
            <!-- Header -->
            <div style="padding:32px 0 24px;">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
                    <h1 style="margin:0;font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;background:var(--gradient-title);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">${S(`ai.title`)}</h1>
                </div>
                <p style="margin:0;color:var(--text-secondary);font-size:1rem;">${S(`ai.subtitlePlanning`,{country:f(w)})}</p>
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
                            <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.07em;color:#7c3a9e;margin:0;">${S(`ai.sectionAiEngine`)}</h2>
                            <button id="aiKeyHelpBtn" type="button" title="${S(`ai.keyHelpBtnTitle`)}" aria-label="${S(`ai.keyHelpBtnTitle`)}"
                                style="background:rgba(155,89,182,0.12); border:1px solid rgba(155,89,182,0.35); color:#7c3a9e; width:24px; height:24px; border-radius:50%; cursor:pointer; font-weight:800; font-size:0.78rem; line-height:1; display:inline-flex; align-items:center; justify-content:center; font-family: Georgia, serif; font-style: italic;">i</button>
                        </div>
                        <p style="color:var(--text-secondary);font-size:0.78rem;margin:0 0 10px;">${S(`ai.keyCardSubtitle`)}</p>
                        <div style="position:relative;">
                            <input id="aiKeyInput" type="password" placeholder="${S(`ai.keyInputPlaceholder`)}" autocomplete="off" spellcheck="false"
                                value="${f(_.geminiApiKey||``)}"
                                style="width:100%; box-sizing:border-box; padding:10px 42px 10px 12px; border:1px solid rgba(0,0,0,0.12); border-radius:10px; font-size:0.85rem; font-family: 'SF Mono', monospace; background:white; color:#002d5b;">
                            <button id="aiKeyToggleBtn" type="button" title="${S(`ai.keyToggleTitle`)}" aria-label="${S(`ai.keyToggleAriaLabel`)}"
                                style="position:absolute; right:6px; top:50%; transform:translateY(-50%); background:transparent; border:0; cursor:pointer; padding:4px 8px; color:rgba(0,0,0,0.5); font-size:0.95rem; line-height:1;">👁</button>
                        </div>
                        <div id="aiKeyStatus" style="margin-top:6px; font-size:0.7rem; font-weight:700; min-height:1em;"></div>
                    </div>
                    <!-- Dates -->
                    <div class="card glass" style="padding:20px;flex:0 0 auto;">
                        <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.07em;color:#005bb8;margin-bottom:14px;">${S(`ai.sectionTravelDates`)}</h2>
                        <div style="display:flex; flex-direction:column; gap:12px;">
                            <div>
                                <label for="aiDateFrom" style="display:block;font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;">${S(`ai.dateFromLabel`)}</label>
                                <input id="aiDateFrom" type="date" class="glass-input" value="${O}" style="width:100%; box-sizing: border-box;">
                            </div>
                            <div>
                                <label for="aiDateTo" style="display:block;font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;">${S(`ai.dateToLabel`)}</label>
                                <input id="aiDateTo" type="date" class="glass-input" value="${k}" style="width:100%; box-sizing: border-box;" min="${O}">
                            </div>
                            <p id="aiDateHint" style="margin:0; font-size:0.74rem; color:var(--text-secondary); line-height:1.45;">${S(`ai.dateHint`)}</p>
                        </div>
                    </div>

                    <div class="card glass" style="padding:20px;flex:1 1 auto;display:flex;flex-direction:column;min-height:0;">
                        <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;color:#005bb8;margin-bottom:10px;letter-spacing:0.05em;">${S(`ai.sectionRequirements`)}</h2>
                        <textarea id="aiExtraContext" class="glass-input" style="width:100%; resize:none; font-size:0.9rem; box-sizing: border-box; flex:1 1 auto; min-height:120px;" placeholder="e.g. Vegetarian friendly, no walking more than 2km...">${P}</textarea>
                    </div>
                    <!-- Generate -->
                    ${I?`<button id="generateBtn" class="ai-generate-btn" style="width:100%; border-radius: var(--radius-lg);flex:0 0 auto;">${S(`ai.generateBtn`)}</button>`:(()=>{let e=i(t);return`<div class="card glass" style="padding:16px; border-radius: var(--radius-lg); text-align:center; color: var(--text-secondary); font-size: 0.85rem; flex:0 0 auto;">
                                ${S(`ai.roleNotice`,{role:S(e===`budgeteer`?`ai.roleBudgeteer`:e===`relaxer`?`ai.roleRelaxer`:`ai.roleObserver`),note:S(e===`budgeteer`?`ai.roleNoteBudgeteer`:`ai.roleNoteOther`)})}
                            </div>`})()}
                </div>

                <!-- Right: Google Map (sticky) -->
                <div style="position:sticky;top:80px;height:700px;">
                    <div class="card glass" style="padding:0;overflow:hidden;height:100%;border-radius:18px;position:relative;">
                        <div id="aiGoogleMap" style="width:100%;height:100%;"></div>
                        <div id="aiZoomBadge" style="position:absolute;bottom:14px;left:14px;z-index:1000;">
                            <span>📍</span> <span>${w}</span>
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
        </div>`,setTimeout(()=>{let i=e.querySelector(`#aiDateFrom`),c=e.querySelector(`#aiDateTo`),u=e.querySelector(`#aiDateHint`);if(i&&c){let e=u?.textContent||``,t=u?.style.color||``,n=()=>{c.min=i.value||``,i.value&&c.value&&c.value<i.value?(u&&(u.textContent=`End date must be on or after the start date.`,u.style.color=`#a82424`),c.setCustomValidity(`End date must be on or after the start date.`)):(u&&(u.textContent=e,u.style.color=t),c.setCustomValidity(``))};i.addEventListener(`change`,n),c.addEventListener(`change`,n),n()}let T=e=>{if(!j)return;let n=t.id+`_ai`;if(_.mapViews&&_.mapViews[n]){let e=_.mapViews[n];j.setCenter({lat:e.lat,lng:e.lng}),j.setZoom(e.zoom);return}if(t.viewport){let e=t.viewport;j.fitBounds(new google.maps.LatLngBounds({lat:e.south,lng:e.west},{lat:e.north,lng:e.east}));return}let r=e.replace(/\(USA\)/g,``).trim();r.includes(` - `)&&(r=r.split(` - `)[1]+`, USA`),new google.maps.Geocoder().geocode({address:r},(e,t)=>{t===`OK`&&e[0]&&j.fitBounds(e[0].geometry.viewport)})};if(typeof google<`u`&&google.maps){let r=document.getElementById(`aiGoogleMap`);r&&(j=new google.maps.Map(r,{center:{lat:20,lng:0},zoom:2,minZoom:2,mapTypeId:`roadmap`,disableDefaultUI:!0,restriction:{latLngBounds:{north:85,south:-85,west:-180,east:180},strictBounds:!0},styles:[]}),n(j,[]),T(w),j.addListener(`idle`,()=>{let e=t.id+`_ai`;_.mapViews||={};let n=j.getCenter();_.mapViews[e]={lat:n.lat(),lng:n.lng(),zoom:j.getZoom()},C(`state:changed`)}));let i=e.querySelector(`#aiZoomBadge`);i&&(i.onclick=()=>{let e=t.id+`_ai`;_.mapViews&&_.mapViews[e]&&delete _.mapViews[e],T(w)})}let D=N,O=(n,r,i)=>{let o=p(e,`#itineraryOutput`);if(!n||!n.length){o.innerHTML=``;return}o.innerHTML=`
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
                    <div>
                        <!-- Phase G UX: text colour switched from white to a
                             blue→purple gradient (matching the day-chip vibe)
                             so the headline reads clearly against the light
                             page background AND ties visually to the day
                             cards below. -->
                        <h2 style="margin:0;font-size:2rem;font-weight:800;letter-spacing:-0.03em;background:var(--gradient-title);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;${L}">${S(`ai.resultHeading`,{numDays:r,country:i})}</h2>
                        <p style="color:var(--text-secondary);margin:6px 0 0;font-size:0.9rem;">${S(`ai.resultGeneratedBy`)}</p>
                    </div>
                    <div style="font-size:0.78rem;color:var(--text-secondary);background:var(--glass-bg);border:1px solid var(--glass-border);padding:5px 14px;border-radius:980px;">${S(`ai.resultBadge`)}</div>
                </div>
                <div id="itineraryDays" style="display:flex;flex-direction:column;gap:16px;"></div>
                ${I?`<div style="display:flex;gap:12px;margin-top:24px;"><button id="acceptPlanBtn" class="btn" style="flex:2;background:var(--accent-blue);color:white;padding:16px;font-size:1.1rem;border-radius:16px;font-weight:700;box-shadow:0 10px 20px rgba(0,122,255,0.2);cursor:pointer;">${S(`ai.acceptPlanBtn`)}</button></div>`:``}`;let s=p(o,`#itineraryDays`),c=[];if(n.forEach((e,t)=>{let n=document.createElement(`div`);n.className=`card glass`,n.style.cssText=`border-radius:18px;overflow:hidden;transition:box-shadow 0.3s,border-color 0.3s;${L}`,n.innerHTML=`
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
                                    <div class="ai-plan-block__title">${f(e.morning?.activity||``)}</div>
                                    ${E(e.morning)}
                                </div>
                                <div class="ai-plan-block" style="--accent: 255,149,0;">
                                    <div class="ai-plan-block__tag">☀️ Afternoon</div>
                                    <div class="ai-plan-block__title">${f(e.afternoon?.activity||``)}</div>
                                    ${E(e.afternoon)}
                                </div>
                                <div class="ai-plan-block" style="--accent: 155,89,182;">
                                    <div class="ai-plan-block__tag">🌙 Evening</div>
                                    <div class="ai-plan-block__title">${f(e.evening?.activity||``)}</div>
                                    ${E(e.evening)}
                                </div>
                            </div>
                            <!-- 💡 Pro Tip block was removed app-wide
                                 (per user) — AI itineraries used to
                                 ship a per-day tip line; no more. -->

                        </div>
                    </div>`,s.appendChild(n),c.push(n)}),j){M.forEach(e=>e.setMap(null)),M=[];let e=new google.maps.LatLngBounds,t=new google.maps.Geocoder,r=(n,r)=>{let a=n.mainLocation||n.title||i;!n.mainLocation&&n.title&&(a=n.title.replace(/Exploring |Day Trip to |Visit |Touring |Arrival in |Departure from |Day \d+:? /gi,``).trim()),t.geocode({address:a+`, `+i},(t,i)=>{if(i===`OK`&&t[0]){let i=t[0].geometry.location;n.lat=i.lat(),n.lon=i.lng();let a=new google.maps.Marker({position:i,map:j,label:{text:String(n.day),color:`white`,fontWeight:`800`},icon:{path:google.maps.SymbolPath.CIRCLE,scale:16,fillColor:`#0071e3`,fillOpacity:1,strokeWeight:2,strokeColor:`white`}});a.addListener(`click`,()=>{c.forEach(e=>{e.style.boxShadow=``,e.style.borderColor=``});let e=c[r];e&&(e.style.boxShadow=`0 0 0 3px var(--accent-blue), 0 8px 32px rgba(0,113,227,0.25)`,e.style.borderColor=`var(--accent-blue)`,e.scrollIntoView({behavior:`smooth`,block:`center`}))}),M.push(a),e.extend(i),M.length>0&&j.fitBounds(e)}})};n.forEach((e,t)=>setTimeout(()=>r(e,t),t*500))}let l=document.getElementById(`acceptPlanBtn`);l&&(l.onclick=()=>{if(!n)return;let e=_.tripDays.filter(e=>e.tripId===t.id&&e.dayNumber>0);_.tripDays=_.tripDays.filter(e=>!(e.tripId===t.id&&e.dayNumber>0)),e.forEach(e=>g(e.id)),a(t),n.forEach((e,n)=>{let r=e.date||new Date().toISOString().split(`T`)[0],i=`day_`+Date.now()+`_`+n,a={id:i,tripId:t.id,date:r,name:e.title||`Day ${n+1}`,dayNumber:n+1,lat:e.lat,lng:e.lon,photos:[],tickets:[],notes:``,plan:{morning:A(e.morning),afternoon:A(e.afternoon),evening:A(e.evening)}};_.tripDays.push(a),y(a);let o=[[`morning`,e.morning],[`afternoon`,e.afternoon],[`evening`,e.evening]];for(let[e,n]of o){let r=Array.isArray(n?.items)?n.items:[];for(let n of r)d(t,n,i,e)}}),v(t),C(`state:changed`),l.innerHTML=`✓ Plan Accepted! (View in Home)`,l.style.background=`#34c759`,l.disabled=!0})},k=()=>{let n=e.querySelector(`#aiTodoListPanel`);if(!n)return;let i=s(t).filter(e=>e.forManual),a=i.filter(e=>e.forAI);if(i.length===0){n.innerHTML=`
                    <div class="card glass" style="padding: 20px; border-radius: 18px; border: 1.5px dashed rgba(155, 89, 182, 0.35); background: rgba(155, 89, 182, 0.04);">
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
                            <span style="font-size: 1.2rem;">📋</span>
                            <h3 style="margin:0; color:#7c3a9e; font-weight:800; letter-spacing:-0.01em;">${S(`ai.todoPanelEmptyTitle`)}</h3>
                        </div>
                        <p style="margin:0 0 12px; color: var(--text-secondary); font-size: 0.9rem;">${S(`ai.todoPanelEmptyBody`)}</p>
                        <button id="aiGoToTodoBtn" class="btn-primary" style="padding: 10px 18px; border-radius: 999px; font-size:0.85rem;">${S(`ai.todoPanelEmptyCta`)}</button>
                    </div>
                `,n.querySelector(`#aiGoToTodoBtn`)?.addEventListener(`click`,()=>h(`todo`));return}if(a.length===0){n.innerHTML=`
                    <div class="card glass" style="padding: 20px; border-radius: 18px; border: 1.5px dashed rgba(155, 89, 182, 0.35); background: rgba(155, 89, 182, 0.04);">
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
                            <span style="font-size: 1.2rem;">📋</span>
                            <h3 style="margin:0; color:#7c3a9e; font-weight:800; letter-spacing:-0.01em;">${b(`ai.todoPanelNoneTickedTitle`,i.length)}</h3>
                        </div>
                        <p style="margin:0 0 12px; color: var(--text-secondary); font-size: 0.9rem;">${S(`ai.todoPanelNoneTickedBody`)}</p>
                        <button id="aiGoToTodoBtn" class="btn-primary" style="padding: 10px 18px; border-radius: 999px; font-size:0.85rem;">${S(`ai.todoPanelNoneTickedCta`)}</button>
                    </div>
                `,n.querySelector(`#aiGoToTodoBtn`)?.addEventListener(`click`,()=>h(`todo`));return}let c=e.querySelector(`#aiDateFrom`),l=e.querySelector(`#aiDateTo`),u=!!(c?.value&&l?.value),d=(_.tripDays||[]).filter(e=>e.tripId===t.id&&e.dayNumber>0).sort((e,t)=>e.dayNumber-t.dayNumber),p=e=>`
                <option value="" ${e?``:`selected`}>${S(`ai.dayOptionAny`)}</option>
                ${d.map(t=>`
                    <option value="${f(t.id)}" ${t.id===e?`selected`:``}>
                        ${S(`ai.dayOptionDay`,{num:t.dayNumber})}${t.date?` — ${o(t.date)||t.date}`:``}
                    </option>
                `).join(``)}
            `,m=e=>`
                <option value="" ${e?``:`selected`}>${S(`ai.timeOptionAny`)}</option>
                <option value="morning"   ${e===`morning`?`selected`:``}>${S(`ai.timeOptionMorning`)}</option>
                <option value="afternoon" ${e===`afternoon`?`selected`:``}>${S(`ai.timeOptionAfternoon`)}</option>
                <option value="evening"   ${e===`evening`?`selected`:``}>${S(`ai.timeOptionEvening`)}</option>
            `,g=a.map(e=>`
                <div class="ai-marked-card" data-place-id="${f(e.placeId)}" style="background:white; border:1.5px solid ${e.color}; border-radius:14px; padding:14px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); display:flex; flex-direction:column; gap:10px; min-height: 0;">
                    <div style="display:flex; align-items:flex-start; gap:10px;">
                        <span style="font-size:1.4rem; line-height:1;">${e.icon}</span>
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight:800; color:#002d5b; font-size:0.95rem; line-height:1.25;">${f(e.name)}</div>
                            ${e.address?`<div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">${f(e.address)}</div>`:``}
                        </div>
                    </div>
                    ${u?`
                        <div style="display:flex; gap:8px; min-width:0;">
                            <select class="marked-day-select" data-place-id="${f(e.placeId)}" style="flex:1 1 0; min-width:0; max-width:100%; padding:6px 8px; border-radius:8px; border:1px solid rgba(0,0,0,0.1); font-size:0.78rem; background:white;">
                                ${p(e.dayId)}
                            </select>
                            <select class="marked-time-select" data-place-id="${f(e.placeId)}" style="flex:1 1 0; min-width:0; max-width:100%; padding:6px 8px; border-radius:8px; border:1px solid rgba(0,0,0,0.1); font-size:0.78rem; background:white;">
                                ${m(e.timeOfDay)}
                            </select>
                        </div>
                    `:`
                        <div style="font-size:0.75rem; color:var(--text-secondary); font-style:italic;">${S(`ai.todoPanelCardNoDates`)}</div>
                    `}
                </div>
            `).join(``);n.innerHTML=`
                <div class="card glass" style="padding:20px; border-radius:18px; border: 1.5px solid rgba(155, 89, 182, 0.25);">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap;">
                        <span style="font-size: 1.2rem;">📋</span>
                        <h3 style="margin:0; color:#7c3a9e; font-weight:800; letter-spacing:-0.01em;">${S(`ai.todoPanelTickedTitle`)} <span style="background:rgba(155,89,182,0.12); color:#7c3a9e; font-size:0.7rem; padding:2px 8px; border-radius:999px; margin-left:6px;">${b(`ai.todoPanelTickedCount`,a.length)}</span></h3>
                        <button id="aiManageTodoBtn" type="button" style="margin-left:auto; background:transparent; border:0; color:#005bb8; font-weight:700; font-size:0.82rem; cursor:pointer; padding:0;">${S(`ai.todoPanelManageBtn`)}</button>
                    </div>
                    <p style="font-size:0.82rem; color:var(--text-secondary); margin:0 0 12px; line-height:1.5;">${S(u?`ai.todoPanelHintWithDates`:`ai.todoPanelHintNoDates`)}</p>
                    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap:12px;">
                        ${g}
                    </div>
                </div>
            `,n.querySelector(`#aiManageTodoBtn`)?.addEventListener(`click`,()=>h(`todo`)),n.querySelectorAll(`.marked-day-select, .marked-time-select`).forEach(e=>{e.onchange=()=>{let i=e.dataset.placeId;if(!i)return;let a=n.querySelector(`.ai-marked-card[data-place-id="${i}"]`);if(!a)return;let o=a.querySelector(`.marked-day-select`),s=a.querySelector(`.marked-time-select`);r(t,i,o?.value||null,s?.value||null),C(`state:changed`),v(t)}})};k(),D&&O(D,F,w);let P=e.querySelector(`#aiExtraContext`);P&&(P.oninput=e=>{t.aiContext=e.target.value,C(`state:changed`)});let R=e.querySelector(`#aiKeyInput`),z=e.querySelector(`#aiKeyToggleBtn`),B=e.querySelector(`#aiKeyHelpBtn`),V=e.querySelector(`#aiKeyStatus`),H=()=>{if(!V)return;let e=(_.geminiApiKey||``).trim();if(!e){V.textContent=S(`ai.keyStatusEmpty`),V.style.color=`#a85d00`;return}let t=e.startsWith(`AIza`)&&e.length>=30;V.textContent=t?`✓ Key saved on this device.`:`⚠ Saved, but the format looks off (Gemini keys usually start with "AIza"). Click i for help.`,V.style.color=t?`#1a6b3c`:`#a85d00`};H(),R&&R.addEventListener(`input`,()=>{_.geminiApiKey=R.value,C(`state:changed`),H()}),z&&R&&z.addEventListener(`click`,()=>{let e=R.type===`text`;R.type=e?`password`:`text`,z.textContent=e?`👁`:`🙈`,z.title=S(e?`ai.keyToggleShow`:`ai.keyToggleHide`)}),B&&B.addEventListener(`click`,()=>{let{root:e,close:t}=l({cardClass:`card glass`,cardStyle:`width: 520px; max-width: calc(100vw - 32px); max-height: 90vh; overflow-y: auto; padding: 28px 32px; border-radius: 28px; background: white;`,innerHTML:`
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 12px;">
                            <h2 style="margin:0; font-size: 1.6rem; color:#7c3a9e; font-weight: 800; letter-spacing:-0.02em;">${S(`ai.keyHelpModalTitle`)}</h2>
                            <button id="aiKeyHelpClose" class="close-x-btn" aria-label="${S(`common.close`)}">✕</button>
                        </div>
                        <p style="margin:0 0 14px; color: var(--text-secondary); font-size: 0.92rem; line-height: 1.5;">
                            ${S(`ai.keyHelpModalIntro`)}
                        </p>
                        <ol style="margin: 0 0 16px 0; padding-left: 22px; color: #002d5b; font-size: 0.92rem; line-height: 1.7;">
                            <li>${S(`ai.keyHelpStepOpenLink`)}</li>
                            <li>${S(`ai.keyHelpStepSignIn`)}</li>
                            <li>${S(`ai.keyHelpStepCreate`)}</li>
                            <li>${S(`ai.keyHelpStepProject`)}</li>
                            <li>${S(`ai.keyHelpStepCopy`)}</li>
                            <li>${S(`ai.keyHelpStepPaste`)}</li>
                        </ol>
                        <div style="background: rgba(155,89,182,0.06); border:1px solid rgba(155,89,182,0.18); border-radius: 14px; padding: 12px 14px; font-size: 0.82rem; color: #002d5b; line-height: 1.55;">
                            <strong>${S(`ai.keyHelpWhatForTitle`)}</strong> ${S(`ai.keyHelpWhatForBody`)}
                        </div>
                        <!-- Free-tier limits. Google no longer publishes
                             fixed numbers on the docs page — they're
                             per-account and rotate based on tier /
                             usage / region — so we describe the shape
                             of the limits and link out to the live
                             dashboard rather than make up specifics. -->
                        <div style="margin-top: 12px; background: rgba(52,199,89,0.06); border:1px solid rgba(52,199,89,0.22); border-radius: 14px; padding: 12px 14px; font-size: 0.82rem; color: #002d5b; line-height: 1.55;">
                            <strong style="color:#1a6b3c;">${S(`ai.keyHelpHowManyTitle`)}</strong>
                            <p style="margin:6px 0 0;">
                                ${S(`ai.keyHelpHowManyBody`)}
                            </p>
                            <div style="margin-top:8px;"><strong style="color:#1a6b3c;">${S(`ai.keyHelpBucketsTitle`)}</strong>
                                <ul style="margin: 4px 0 0; padding-left: 18px;">
                                    <li>${S(`ai.keyHelpBucketMinute`)}</li>
                                    <li>${S(`ai.keyHelpBucketDay`)}</li>
                                </ul>
                            </div>
                            <div style="margin-top:8px;">
                                ${S(`ai.keyHelpRateLimitTip`)}
                            </div>
                            <div style="margin-top:8px; font-size: 0.78rem;">
                                ${S(`ai.keyHelpDashboardLink`)}
                            </div>
                        </div>
                        <div style="display:flex; justify-content:flex-end; margin-top:18px;">
                            <button id="aiKeyHelpDone" class="btn-primary" style="padding: 10px 22px; border-radius: 999px;">${S(`ai.keyHelpDoneBtn`)}</button>
                        </div>
                    `});e.querySelector(`#aiKeyHelpClose`)?.addEventListener(`click`,t),e.querySelector(`#aiKeyHelpDone`)?.addEventListener(`click`,t)}),[`#aiDateFrom`,`#aiDateTo`].forEach(t=>{let n=e.querySelector(t);n&&n.addEventListener(`change`,()=>k())});let U=e.querySelector(`#generateBtn`),W=async()=>{let n=p(e,`#itineraryOutput`),r=p(e,`#aiDateFrom`).value,i=p(e,`#aiDateTo`).value,a=document.getElementById(`aiExtraContext`)?.value??``;if(!r||!i){m(S(`ai.toastPickDates`));return}if(i<r){m(S(`ai.toastEndBeforeStart`));return}let o=new Date(r),c=new Date(i),l=Math.max(1,Math.round((c.getTime()-o.getTime())/864e5)+1),u=s(t).filter(e=>e.forAI&&e.forManual),d=``;if(u.length>0){let e=(_.tripDays||[]).filter(e=>e.tripId===t.id&&e.dayNumber>0),n=t=>e.find(e=>e.id===t)?.dayNumber;d=`\n\nThe user has marked these specific places to include in the itinerary. Please incorporate them where they fit, respecting any day/time assignments where given:\n${u.map(e=>{let t=e.dayId?n(e.dayId):null,r=t?`, on Day ${t}`:``,i=e.timeOfDay?`, ${e.timeOfDay}`:``,a=e.address?` (${e.address})`:``;return`- ${e.name}${a}${r}${i}`}).join(`
`)}`}let h=a+d;t.aiContext=a,t.aiNumDays=l,C(`state:changed`),n.innerHTML=`<div style="text-align:center;padding:60px;"><div class="spinner-ring" style="width:40px;height:40px;border:3px solid rgba(0,113,227,0.15);border-top-color:#005bb8;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 20px;"></div><div style="color:var(--text-primary);font-weight:600;">${S(`ai.loadingTitle`)}</div><div style="color:var(--text-secondary);font-size:0.82rem;margin-top:6px;">${S(`ai.loadingBody`)}</div></div>`,n.scrollIntoView({behavior:`smooth`});let g=U?.innerHTML||``;U&&(U.disabled=!0,U.innerHTML=S(`ai.generatingBtn`));try{let e=await(await x(`/api/generate_itinerary`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({destination:w,numDays:l,dateFrom:r,dateTo:i,context:h,gemini_key:(_.geminiApiKey||``).trim()})})).json();if(e.error)throw Error(e.error);D=e.itinerary,D==null?delete t.aiPlan:t.aiPlan=D,C(`state:changed`),O(D,l,w),n.scrollIntoView({behavior:`smooth`})}catch(e){let t=e.message||``,r=S(`ai.errorGeneric`),i=``;/UNAVAILABLE|503|overloaded/i.test(t)?(r=S(`ai.errorOverloaded`),i=S(`ai.errorOverloadedHint`)):/quota|limit|RESOURCE_EXHAUSTED|429/i.test(t)?(r=S(`ai.errorQuota`),i=S(`ai.errorQuotaHint`)):/key|api[_ ]?key|UNAUTHENTICATED|401|403/i.test(t)?(r=S(`ai.errorBadKey`),i=S(`ai.errorBadKeyHint`)):/network|fetch|timed?[\- ]?out|ECONN/i.test(t)&&(r=S(`ai.errorNetwork`),i=S(`ai.errorNetworkHint`)),n.innerHTML=`
                    <div class="card glass" style="text-align:center;padding:32px 28px;">
                        <div style="font-size:2.4rem;margin-bottom:8px;">😬</div>
                        <h2 style="color:#a82424;margin:0 0 6px;font-size:1.2rem;">${f(r)}</h2>
                        ${i?`<p style="margin:0 0 18px;color:var(--text-secondary);font-size:0.9rem;line-height:1.5;">${f(i)}</p>`:``}
                        <details style="margin:0 0 18px;text-align:left;background:rgba(255,59,48,0.04);border:1px solid rgba(255,59,48,0.16);border-radius:10px;padding:8px 12px;">
                            <summary style="cursor:pointer;font-size:0.78rem;font-weight:700;color:#7c3a9e;">${S(`ai.errorTechnicalDetails`)}</summary>
                            <pre style="margin:8px 0 0;font-size:0.72rem;color:#666;font-family:monospace;white-space:pre-wrap;word-break:break-word;">${f(t||S(`ai.errorUnknown`))}</pre>
                        </details>
                        <button id="aiRetryBtn" type="button" style="padding:10px 22px;border-radius:999px;border:0;background:var(--accent-blue);color:white;font-size:0.92rem;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(0,113,227,0.28);">${S(`ai.errorRetryBtn`)}</button>
                    </div>
                `,m(r),n.querySelector(`#aiRetryBtn`)?.addEventListener(`click`,()=>W())}finally{U&&(U.disabled=!1,U.innerHTML=g)}};U?.addEventListener(`click`,W)},0),e}var P=t();function F(){let e=(0,T.useRef)(null);return(0,T.useEffect)(()=>{let t=e.current;t&&(t.innerHTML=``,t.appendChild(N()))},[]),(0,P.jsx)(`div`,{ref:e})}function I(e){w(e,(0,T.createElement)(F))}export{I as mountAI};
//# sourceMappingURL=mount-B1zraUja.js.map