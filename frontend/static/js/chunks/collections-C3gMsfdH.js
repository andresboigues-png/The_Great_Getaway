import{Ht as e,I as t,K as n,N as r,Pt as i,Q as a,S as o,St as s,Tt as c,Ut as l,W as u,Z as d,_t as f,b as p,gt as m,ht as h,i as g,kt as _,pt as v,v as y,vt as b,x,z as S}from"../app.bundle.js";var C=async(t,n)=>{let r=e.archivedTrips.find(e=>e.id===t)||e.trips.find(e=>e.id===t);if(r&&(r.isPublic=n!==`private`,r.publicShowExpenses=n===`public-full`,l(`state:changed`),e.user))try{await d(r)}catch{}},w=t=>{let n=e.archivedTrips.find(e=>e.id===t);n&&s({title:`Restore Trip?`,message:`This will move the trip back to your active list.`,confirmText:`Restore`,onConfirm:()=>{n.isArchived=!1,n.expenses&&(e.expenses=[...e.expenses,...n.expenses],delete n.expenses),n.tripDays&&(e.tripDays=[...e.tripDays,...n.tripDays],delete n.tripDays),e.trips.push(n),e.archivedTrips=e.archivedTrips.filter(e=>e.id!==t),e.activeTripId=t,l(`state:changed`),u(t),a(`home`)}})},T=t=>{s({title:`Delete Permanently?`,message:`This trip and all its memories will be gone forever.`,confirmText:`Delete`,onConfirm:async()=>{if(e.archivedTrips=e.archivedTrips.filter(e=>e.id!==t),l(`state:changed`),e.user)try{await fetch(x(`/api/trips/delete`),{method:`DELETE`,headers:{"Content-Type":`application/json`},body:JSON.stringify({user_id:e.user.id,trip_id:t})})}catch{}a(`collections`)}})};function E(u){let d=typeof u==`string`?e.archivedTrips.find(e=>e.id===u)||e.trips.find(e=>e.id===u):u,p=document.createElement(`div`);if(!d)return p.innerHTML=`<p style="padding: 40px; text-align: center;">Trip not found.</p>`,p;let y=(d.expenses||[]).filter(e=>!e.isSettlement),x=y.reduce((e,t)=>e+(t.euroValue||0),0),T=d.tripDays||[],E=T.length,D=Array.isArray(d.photos)?d.photos:[],O=Array.isArray(d.documents)?d.documents:[],k=T.reduce((e,t)=>e+(t.photos||[]).length,0)+D.length,A=T.reduce((e,t)=>e+(t.tickets||[]).length,0)+O.length,j=null;if(d.coverUrl&&(j=d.coverUrl),!j&&D.length>0&&(j=D[0].src),!j){for(let e of T)if(e.photos&&e.photos.length>0){j=e.photos[0];break}}let M=j?`background: linear-gradient(135deg, rgba(0,45,91,0.55), rgba(88,86,214,0.45)), url(${c(j)}) center/cover no-repeat;`:`background: linear-gradient(135deg, #007aff 0%, #5856d6 60%, #34c759 130%);`,N=`#ffffff`,P=`rgba(255,255,255,0.85)`,F=`rgba(255,255,255,0.16)`,I=`1px solid rgba(255,255,255,0.25)`,L=(e,t,n)=>`
        <div style="display:flex; align-items:center; gap:10px; background:${F}; border:${I}; padding:10px 16px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">
            <span style="font-size:1.05rem; line-height:1;">${e}</span>
            <div style="display:flex; flex-direction:column; line-height:1.05;">
                <span style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:${P};">${c(t)}</span>
                <span style="font-size:0.95rem; font-weight:800; color:${N};">${c(n)}</span>
            </div>
        </div>
    `;p.innerHTML=`
        <div class="archived-hero" style="position:relative; overflow:hidden; border-radius:36px; padding:48px 52px; ${M} box-shadow: 0 30px 80px rgba(0, 45, 91, 0.25); margin-bottom: 32px; border: 1px solid rgba(255,255,255,0.18);">
            <!-- Subtle inner light wash, lifts the photo bg and keeps
                 readability when the photo is bright. -->
            <div style="position:absolute; inset:0; background: radial-gradient(circle at 20% 0%, rgba(255,255,255,0.18) 0%, transparent 55%); pointer-events:none;"></div>

            <!-- Action pills float top-right. Order: Back, then
                 (when public) Share, then Restore. Share is the new
                 home of the share-to-feed entry point — moved here
                 from the home-page trip header so only trips the
                 user has explicitly marked Public can be shared.
                 Outline pill aesthetic for Back + Share matches the
                 .btn-primary-pill family already used by Restore. -->
            <div style="position:absolute; top:24px; right:24px; display:flex; gap:8px; z-index:2;">
                <button id="backToCollectionsBtn" type="button" style="background:rgba(255,255,255,0.16); border:1px solid rgba(255,255,255,0.3); color:#ffffff; padding:10px 18px; border-radius:999px; font-weight:800; font-size:0.85rem; cursor:pointer; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">← Back</button>
                <!-- Share button — now ALWAYS visible (no isPublic
                     gate). Opens the Share Chooser which lets the
                     user pick between "Share to feed" (in-app post,
                     still requires the trip be public) and "Get
                     share link" (public URL, no precondition). The
                     button's existence at minimum advertises that
                     completed trips ARE shareable, even if the
                     feed-share path needs the public toggle flipped
                     first. -->
                <button id="shareTripBtn" type="button" data-trip-id="${c(d.id)}" title="Share this trip" aria-label="Share this trip"
                    class="ad-pill-glass">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="18" cy="5" r="3"></circle>
                        <circle cx="6" cy="12" r="3"></circle>
                        <circle cx="18" cy="19" r="3"></circle>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                    </svg>
                    Share
                </button>
                <!-- §4.6 — Clone button. Available on every
                     archived trip detail (own AND fetched-via-public
                     trips). Drops a fresh draft into the user's
                     active trips with the same Path + ideas; their
                     expenses / photos / companions are NOT carried
                     over (clone is a template, not a copy). -->
                <button id="cloneTripBtn" type="button" data-trip-id="${c(d.id)}" title="Start a new trip based on this one" aria-label="Clone this trip"
                    class="ad-pill-glass">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    Clone
                </button>
                <button class="restore-trip-btn" data-trip-id="${c(d.id)}" type="button" style="background:#ffffff; color:#002d5b; padding:10px 18px; border-radius:999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,0.18); border: 0;">↺ Restore Trip</button>
            </div>

            <!-- Top tag chip + title block. -->
            <div style="position:relative; z-index:1; max-width: calc(100% - 260px);">
                <div style="display:inline-flex; align-items:center; gap:8px; background:${F}; border:${I}; padding:6px 14px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); margin-bottom:18px;">
                    <span style="font-size:0.85rem; line-height:1;">📚</span>
                    <span style="font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.18em; color:${N};">Completed memory</span>
                </div>
                <h1 style="font-size: 3.2rem; margin: 0; letter-spacing: -0.04em; color: ${N}; font-weight: 800; line-height: 1; text-shadow: 0 2px 24px rgba(0,0,0,0.2);">${c(d.name)}</h1>
                ${d.country?`<div style="margin-top:10px; font-size:1rem; color:${P}; font-weight:600; display:flex; align-items:center; gap:8px;">📍 ${c(d.country)}</div>`:``}
            </div>

            <!-- Stat chip row. -->
            <div style="position:relative; z-index:1; display:flex; flex-wrap:wrap; gap:10px; margin-top:24px;">
                ${L(`🗓️`,`Days`,String(E))}
                ${k>0?L(`📸`,`Photos`,String(k)):``}
                ${A>0?L(`📎`,`Documents`,String(A)):``}
                ${y.length>0?L(`💰`,`Spent`,i(x,`EUR`)):``}

                <!-- Public-trip granularity select, styled as a chip.
                     Replaces the legacy binary toggle. Three states:
                     private / public — plan only / public — incl.
                     expenses. Members ALWAYS see expenses regardless
                     of this flag (server-side gate). -->
                <div style="display:flex; align-items:center; gap:6px; background:${F}; border:${I}; padding:6px 14px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">
                    <select
                        class="trip-privacy-select"
                        data-trip-id="${c(d.id)}"
                        aria-label="Trip visibility"
                        style="background:transparent; border:0; color:${N}; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; padding: 2px 18px 2px 4px; appearance:none; -webkit-appearance:none; cursor:pointer; outline:none; background-image: url('data:image/svg+xml;utf8,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;10&quot; height=&quot;10&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;white&quot; stroke-width=&quot;3&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><polyline points=&quot;6 9 12 15 18 9&quot;/></svg>'); background-repeat:no-repeat; background-position: right 4px center; background-size: 8px;">
                        <option value="private" ${d.isPublic?``:`selected`} class="text-brand-navy">🔒 Private</option>
                        <option value="public-plan" ${d.isPublic&&!d.publicShowExpenses?`selected`:``} class="text-brand-navy">🌍 Public — plan only</option>
                        <option value="public-full" ${d.isPublic&&d.publicShowExpenses?`selected`:``} class="text-brand-navy">🌍 Public — incl. expenses</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- Day grid. Each card is keyboard-accessible (role=button)
             and opens the read-only openDayView modal on click. -->
        <div style="display:flex; align-items:baseline; gap:12px; margin: 8px 4px 14px;">
            <h2 class="ad-hero-title">The journey</h2>
            <span class="ad-text-muted-sm">Tap a day to relive what was planned.</span>
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:18px;">
            ${T.sort((e,t)=>e.dayNumber-t.dayNumber).map(e=>{let t=e.photos||[],n=D.filter(t=>t.dayId===e.id),r=t.length+n.length,i=e.tickets||[],a=O.filter(t=>t.dayId===e.id),o=i.length+a.length,s=Number(e.dayNumber)===0,l=t[0]||n[0]?.src||null,u=!!l;return`
                    <div class="archived-day-block" data-day-id="${c(e.id)}" role="button" tabindex="0" aria-label="View Day ${e.dayNumber}${e.name?` — `+e.name:``}"
                        style="position:relative; cursor:pointer; min-height:170px; border-radius:24px; padding:20px; display:flex; flex-direction:column; justify-content:space-between; transition: transform 0.35s cubic-bezier(0.16,1,0.3,1), box-shadow 0.35s cubic-bezier(0.16,1,0.3,1); ${u?`background: linear-gradient(180deg, rgba(0,45,91,0.15) 0%, rgba(0,45,91,0.78) 100%), url(${c(l)}) center/cover no-repeat; border: 1px solid rgba(0,0,0,0.08); color: white;`:`background: white; border: 1.5px solid rgba(0,113,227,0.18); color: #002d5b;`} box-shadow: 0 10px 30px rgba(0,0,0,0.06);"
                        onmouseover="this.style.transform='translateY(-6px)';this.style.boxShadow='0 24px 50px rgba(0,0,0,0.16)';"
                        onmouseout="this.style.transform='';this.style.boxShadow='0 10px 30px rgba(0,0,0,0.06)';">
                        <!-- Top: badge -->
                        <div class="flex items-center gap-2">
                            <span style="background: ${s?`rgba(52,199,89,0.95)`:`rgba(0,113,227,0.95)`}; color:white; padding: 4px 12px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.1em;">${s?`⚓ Anchor`:`Day ${e.dayNumber}`}</span>
                        </div>
                        <!-- Bottom: name + count chips -->
                        <div>
                            <h3 style="margin:0; font-size:1.4rem; font-weight:800; letter-spacing:-0.02em; color:${u?`#ffffff`:`#002d5b`}; line-height:1.15; ${u?`text-shadow: 0 2px 12px rgba(0,0,0,0.4);`:``}">${c(e.name||(s?`Trip Anchor`:`Day ${e.dayNumber}`))}</h3>
                            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
                                ${r>0?`<span style="background:${u?`rgba(255,255,255,0.18)`:`rgba(0,113,227,0.08)`}; color:${u?`#ffffff`:`var(--accent-blue)`}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">📸 ${r}</span>`:``}
                                ${o>0?`<span style="background:${u?`rgba(255,255,255,0.18)`:`rgba(88,86,214,0.08)`}; color:${u?`#ffffff`:`#5856d6`}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">📎 ${o}</span>`:``}
                                ${e.notes?`<span style="background:${u?`rgba(255,255,255,0.18)`:`rgba(255,149,0,0.08)`}; color:${u?`#ffffff`:`#ff9500`}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">📝 Notes</span>`:``}
                            </div>
                        </div>
                    </div>
                `}).join(``)}
        </div>

        ${(()=>{let e=e=>{if(!e)return null;let t=T.find(t=>t.id===e);return t?Number(t.dayNumber)===0?`⚓ Anchor`:`Day ${t.dayNumber}`:null},t=e=>{if(!e)return!1;let t=T.find(t=>t.id===e);return!!t&&Number(t.dayNumber)===0},n=n=>{if(t(n))return`<span style="background:rgba(52,199,89,0.12); color:#1a6b3c; padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">⚓ Anchor</span>`;let r=e(n);return r?`<span style="background:rgba(0,113,227,0.08); color:var(--accent-blue); padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${c(r)}</span>`:`<span style="background:rgba(0,0,0,0.05); color:rgba(0,0,0,0.45); padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">Unsorted</span>`},r=[];O.forEach(e=>r.push({name:e.name||`Document`,url:e.url||``,dayId:e.dayId||null,source:`trip`,_key:e.id||`${e.name}-${e.url}`})),T.forEach(e=>{(e.tickets||[]).forEach((t,n)=>r.push({name:t.name||`Document`,url:t.url||``,dayId:e.id,source:`day`,_key:`${e.id}#${n}`}))});let i=e=>{if(!e)return-1;let t=T.find(t=>t.id===e);return t?t.dayNumber:999};r.sort((e,t)=>i(e.dayId)-i(t.dayId));let a=[];D.forEach(e=>a.push({src:e.src||``,dayId:e.dayId||null,source:`trip`,_key:e.id||e.src})),T.forEach(e=>{(e.photos||[]).forEach((t,n)=>a.push({src:t,dayId:e.id,source:`day`,_key:`${e.id}#${n}`}))}),a.sort((e,t)=>i(e.dayId)-i(t.dayId));let o=e=>/^data:image\//i.test(e||``)||/\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|tiff?|svg)(\?.*)?$/i.test(e||``);return(r.length===0?``:`
                <div class="ad-section-header-row">
                    <h2 class="ad-hero-title">Documents</h2>
                    <span class="ad-text-muted-sm">${r.length} saved · click any to open</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:8px;">
                    ${r.map(e=>`
                        <a href="${c(e.url||`#`)}" target="_blank" rel="noreferrer" style="display:flex; align-items:center; gap:12px; background:white; border:1px solid rgba(0,0,0,0.07); border-radius:14px; padding:12px 14px; box-shadow: 0 2px 8px rgba(0,45,91,0.04); text-decoration:none; color:#002d5b;">
                            <span style="font-size:1.3rem; line-height:1; flex-shrink:0;">📎</span>
                            <div style="flex:1; min-width:0;">
                                <div class="flex items-center gap-2">
                                    <span style="font-weight:800; font-size:0.92rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${c(e.name)}</span>
                                    ${n(e.dayId)}
                                </div>
                                ${e.url?`<div style="font-size:0.7rem; color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${c(e.url)}</div>`:``}
                            </div>
                            <span style="color: var(--accent-blue); font-size:0.78rem; font-weight:700; flex-shrink:0;">Open ↗</span>
                        </a>
                    `).join(``)}
                </div>
            `)+(a.length===0?``:`
                <div class="ad-section-header-row">
                    <h2 class="ad-hero-title">All photos</h2>
                    <span class="ad-text-muted-sm">${a.length} saved</span>
                </div>
                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:10px; margin-bottom:24px;">
                    ${a.map(n=>{let r=e(n.dayId),i=t(n.dayId)?`rgba(52,199,89,0.85)`:`rgba(0,0,0,0.55)`,a=r?`<div style="position:absolute; top:6px; left:6px; background: ${i}; color:white; padding:2px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; backdrop-filter: blur(6px);">${c(r)}</div>`:`<div style="position:absolute; top:6px; left:6px; background: rgba(0,0,0,0.45); color:white; padding:2px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; backdrop-filter: blur(6px);">Unsorted</div>`;return o(n.src)?`<a href="${c(n.src)}" target="_blank" rel="noreferrer" style="position:relative; aspect-ratio:1; border-radius:14px; overflow:hidden; background-image:url(${c(n.src)}); background-size:cover; background-position:center; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border:1px solid rgba(0,0,0,0.06); display:block;">${a}</a>`:`<a href="${c(n.src)}" target="_blank" rel="noreferrer" style="position:relative; aspect-ratio:1; border-radius:14px; overflow:hidden; background: var(--gradient-day); box-shadow: 0 4px 12px rgba(0,113,227,0.18); border:1px solid rgba(0,0,0,0.06); display:flex; flex-direction:column; align-items:center; justify-content:center; padding:14px; text-align:center; color:white; text-decoration:none;">${a}<div style="font-size:1.8rem; line-height:1; margin-bottom:8px;">🔗</div><div style="font-size:0.7rem; font-weight:800; opacity:0.9; word-break:break-all; overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;">${c(n.src.replace(/^https?:\/\//,``))}</div></a>`}).join(``)}
                </div>
            `)})()}
    `,p.querySelector(`#backToCollectionsBtn`)?.addEventListener(`click`,()=>a(`collections`));let R=p.querySelector(`#shareTripBtn`);return R&&r(d.id).then(e=>{e?.shared&&(R.dataset.shared=`1`,R.dataset.postId=String(e.post_id),m(R,!0))}),p.addEventListener(`click`,async r=>{let i=r.target,c=i?.closest(`.restore-trip-btn`);if(c?.dataset.tripId){w(c.dataset.tripId);return}let u=i?.closest(`#cloneTripBtn`);if(u?.dataset.tripId){u.setAttribute(`disabled`,`true`);let n=u.innerHTML;u.innerHTML=`Cloning…`;try{let r=await o(u.dataset.tripId);if(!r?.ok||!r.body?.tripId){_(`Couldn't clone — try again in a moment.`),u.removeAttribute(`disabled`),u.innerHTML=n;return}let i=r.body.tripId;e.activeTripId=i,await t(),e.activeTripId=i,l(`state:changed`),_(`Trip cloned! Edit your draft on Home.`),a(`home`)}catch(e){console.error(`Clone failed:`,e),_(`Couldn't clone — try again in a moment.`),u.removeAttribute(`disabled`),u.innerHTML=n}return}let p=i?.closest(`#shareTripBtn`);if(p){g({trip:d,onShareToFeed:()=>{if(p.dataset.shared===`1`){let e=Number(p.dataset.postId||0);if(!e)return;s({title:`Unshare this trip?`,message:`It'll disappear from your friends' feeds. Any reposts of it will be removed too.`,confirmText:`Unshare`,onConfirm:async()=>{let t=await n(e);if(!t||!t.ok){_(`Couldn't unshare — try again in a moment.`);return}p.dataset.shared=`0`,p.dataset.postId=``,m(p,!1),_(`Removed from your feed.`)}});return}h(d,async e=>{let t=await S(d.id,e);if(!t||!t.ok){_(`Couldn't share — try again in a moment.`);return}let n=Number(t.body?.post_id)||0;n&&(p.dataset.shared=`1`,p.dataset.postId=String(n),m(p,!0)),t.body?.status===`already_shared`?_(e?`Updated your share.`:`Already shared to your feed.`):_(`Shared to your feed.`)})}});return}let y=i?.closest(`a[href]`);if(y&&f(y.href)){let e=r;if(!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&e.button!==1){e.preventDefault();let t=y.querySelector(`span`)?.textContent?.trim()||`Document`;b(y.href,t);return}}let x=i?.closest(`.archived-day-block`);if(x?.dataset.dayId){let e=(d.tripDays||[]).find(e=>e.id===x.dataset.dayId);e&&v(e);return}}),p.addEventListener(`change`,e=>{let t=e.target?.closest(`.trip-privacy-select`);t?.dataset.tripId&&C(t.dataset.tripId,t.value)}),p}var D=async t=>{let n=document.getElementById(`app-container`);if(!n)return;let r=e.archivedTrips.find(e=>e.id===t)||e.trips.find(e=>e.id===t);if(r){n.innerHTML=``,n.appendChild(E(r));return}n.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary); font-size:0.95rem;">${y(`collections.loadingTrip`)}</div>`;try{let e=await p(`/api/public-trip/${encodeURIComponent(t)}`);if(!e.ok){n.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">${y(`collections.tripUnavailable`)}</div>`;return}let r=await e.json();if(!r?.trip){n.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">${y(`collections.tripNotFound`)}</div>`;return}n.innerHTML=``,n.appendChild(E(r.trip))}catch(e){console.error(`viewArchivedDetails fetch failed:`,e),n.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">${y(`collections.loadFailed`)}</div>`}};export{C as i,T as n,w as r,D as t};
//# sourceMappingURL=collections-C3gMsfdH.js.map