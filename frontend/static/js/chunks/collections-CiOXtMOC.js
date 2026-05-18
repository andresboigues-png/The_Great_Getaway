import{$ as e,At as t,B as n,C as r,Ct as i,Et as a,Ft as o,G as s,L as c,P as l,Q as u,S as d,Ut as f,Wt as p,_t as m,a as h,gt as g,mt as _,q as v,vt as y,x as b,y as x,yt as S}from"../app.bundle.js";var C=async(e,t)=>{let n=f.archivedTrips.find(t=>t.id===e)||f.trips.find(t=>t.id===e);if(n&&(n.isPublic=t!==`private`,n.publicShowExpenses=t===`public-full`,p(`state:changed`),f.user))try{await u(n)}catch{}},w=t=>{let n=f.archivedTrips.find(e=>e.id===t);n&&i({title:`Restore Trip?`,message:`This will move the trip back to your active list.`,confirmText:`Restore`,onConfirm:()=>{n.isArchived=!1,n.expenses&&(f.expenses=[...f.expenses,...n.expenses],delete n.expenses),n.tripDays&&(f.tripDays=[...f.tripDays,...n.tripDays],delete n.tripDays),f.trips.push(n),f.archivedTrips=f.archivedTrips.filter(e=>e.id!==t),f.activeTripId=t,p(`state:changed`),s(t),e(`home`)}})},T=t=>{i({title:`Delete Permanently?`,message:`This trip and all its memories will be gone forever.`,confirmText:`Delete`,onConfirm:async()=>{if(f.archivedTrips=f.archivedTrips.filter(e=>e.id!==t),p(`state:changed`),f.user)try{await fetch(d(`/api/trips/delete`),{method:`DELETE`,headers:{"Content-Type":`application/json`},body:JSON.stringify({user_id:f.user.id,trip_id:t})})}catch{}e(`collections`)}})};function E(s){let u=typeof s==`string`?f.archivedTrips.find(e=>e.id===s)||f.trips.find(e=>e.id===s):s,d=document.createElement(`div`);if(!u)return d.innerHTML=`<p style="padding: 40px; text-align: center;">Trip not found.</p>`,d;let b=(u.expenses||[]).filter(e=>!e.isSettlement),x=b.reduce((e,t)=>e+(t.euroValue||0),0),T=u.tripDays||[],E=T.length,D=Array.isArray(u.photos)?u.photos:[],O=Array.isArray(u.documents)?u.documents:[],k=T.reduce((e,t)=>e+(t.photos||[]).length,0)+D.length,A=T.reduce((e,t)=>e+(t.tickets||[]).length,0)+O.length,j=null;if(u.coverUrl&&(j=u.coverUrl),!j&&D.length>0&&(j=D[0].src),!j){for(let e of T)if(e.photos&&e.photos.length>0){j=e.photos[0];break}}let M=j?`background: linear-gradient(135deg, rgba(0,45,91,0.55), rgba(88,86,214,0.45)), url(${a(j)}) center/cover no-repeat;`:`background: linear-gradient(135deg, #007aff 0%, #5856d6 60%, #34c759 130%);`,N=`#ffffff`,P=`rgba(255,255,255,0.85)`,F=`rgba(255,255,255,0.16)`,I=`1px solid rgba(255,255,255,0.25)`,L=(e,t,n)=>`
        <div style="display:flex; align-items:center; gap:10px; background:${F}; border:${I}; padding:10px 16px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">
            <span style="font-size:1.05rem; line-height:1;">${e}</span>
            <div style="display:flex; flex-direction:column; line-height:1.05;">
                <span style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:${P};">${a(t)}</span>
                <span style="font-size:0.95rem; font-weight:800; color:${N};">${a(n)}</span>
            </div>
        </div>
    `;d.innerHTML=`
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
                <button id="shareTripBtn" type="button" data-trip-id="${a(u.id)}" title="Share this trip" aria-label="Share this trip"
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
                <button id="cloneTripBtn" type="button" data-trip-id="${a(u.id)}" title="Start a new trip based on this one" aria-label="Clone this trip"
                    class="ad-pill-glass">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    Clone
                </button>
                <button class="restore-trip-btn" data-trip-id="${a(u.id)}" type="button" style="background:#ffffff; color:#002d5b; padding:10px 18px; border-radius:999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,0.18); border: 0;">↺ Restore Trip</button>
            </div>

            <!-- Top tag chip + title block. -->
            <div style="position:relative; z-index:1; max-width: calc(100% - 260px);">
                <div style="display:inline-flex; align-items:center; gap:8px; background:${F}; border:${I}; padding:6px 14px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); margin-bottom:18px;">
                    <span style="font-size:0.85rem; line-height:1;">📚</span>
                    <span style="font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.18em; color:${N};">Completed memory</span>
                </div>
                <h1 style="font-size: 3.2rem; margin: 0; letter-spacing: -0.04em; color: ${N}; font-weight: 800; line-height: 1; text-shadow: 0 2px 24px rgba(0,0,0,0.2);">${a(u.name)}</h1>
                ${u.country?`<div style="margin-top:10px; font-size:1rem; color:${P}; font-weight:600; display:flex; align-items:center; gap:8px;">📍 ${a(u.country)}</div>`:``}
            </div>

            <!-- Stat chip row. -->
            <div style="position:relative; z-index:1; display:flex; flex-wrap:wrap; gap:10px; margin-top:24px;">
                ${L(`🗓️`,`Days`,String(E))}
                ${k>0?L(`📸`,`Photos`,String(k)):``}
                ${A>0?L(`📎`,`Documents`,String(A)):``}
                ${b.length>0?L(`💰`,`Spent`,o(x,`EUR`)):``}

                <!-- Public-trip granularity select, styled as a chip.
                     Replaces the legacy binary toggle. Three states:
                     private / public — plan only / public — incl.
                     expenses. Members ALWAYS see expenses regardless
                     of this flag (server-side gate). -->
                <div style="display:flex; align-items:center; gap:6px; background:${F}; border:${I}; padding:6px 14px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">
                    <select
                        class="trip-privacy-select"
                        data-trip-id="${a(u.id)}"
                        aria-label="Trip visibility"
                        style="background:transparent; border:0; color:${N}; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; padding: 2px 18px 2px 4px; appearance:none; -webkit-appearance:none; cursor:pointer; outline:none; background-image: url('data:image/svg+xml;utf8,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;10&quot; height=&quot;10&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;white&quot; stroke-width=&quot;3&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><polyline points=&quot;6 9 12 15 18 9&quot;/></svg>'); background-repeat:no-repeat; background-position: right 4px center; background-size: 8px;">
                        <option value="private" ${u.isPublic?``:`selected`} class="text-brand-navy">🔒 Private</option>
                        <option value="public-plan" ${u.isPublic&&!u.publicShowExpenses?`selected`:``} class="text-brand-navy">🌍 Public — plan only</option>
                        <option value="public-full" ${u.isPublic&&u.publicShowExpenses?`selected`:``} class="text-brand-navy">🌍 Public — incl. expenses</option>
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
            ${T.sort((e,t)=>e.dayNumber-t.dayNumber).map(e=>{let t=e.photos||[],n=D.filter(t=>t.dayId===e.id),r=t.length+n.length,i=e.tickets||[],o=O.filter(t=>t.dayId===e.id),s=i.length+o.length,c=Number(e.dayNumber)===0,l=t[0]||n[0]?.src||null,u=!!l;return`
                    <div class="archived-day-block" data-day-id="${a(e.id)}" role="button" tabindex="0" aria-label="View Day ${e.dayNumber}${e.name?` — `+e.name:``}"
                        style="position:relative; cursor:pointer; min-height:170px; border-radius:24px; padding:20px; display:flex; flex-direction:column; justify-content:space-between; transition: transform 0.35s cubic-bezier(0.16,1,0.3,1), box-shadow 0.35s cubic-bezier(0.16,1,0.3,1); ${u?`background: linear-gradient(180deg, rgba(0,45,91,0.15) 0%, rgba(0,45,91,0.78) 100%), url(${a(l)}) center/cover no-repeat; border: 1px solid rgba(0,0,0,0.08); color: white;`:`background: white; border: 1.5px solid rgba(0,113,227,0.18); color: #002d5b;`} box-shadow: 0 10px 30px rgba(0,0,0,0.06);"
                        onmouseover="this.style.transform='translateY(-6px)';this.style.boxShadow='0 24px 50px rgba(0,0,0,0.16)';"
                        onmouseout="this.style.transform='';this.style.boxShadow='0 10px 30px rgba(0,0,0,0.06)';">
                        <!-- Top: badge -->
                        <div class="flex items-center gap-2">
                            <span style="background: ${c?`rgba(52,199,89,0.95)`:`rgba(0,113,227,0.95)`}; color:white; padding: 4px 12px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.1em;">${c?`⚓ Anchor`:`Day ${e.dayNumber}`}</span>
                        </div>
                        <!-- Bottom: name + count chips -->
                        <div>
                            <h3 style="margin:0; font-size:1.4rem; font-weight:800; letter-spacing:-0.02em; color:${u?`#ffffff`:`#002d5b`}; line-height:1.15; ${u?`text-shadow: 0 2px 12px rgba(0,0,0,0.4);`:``}">${a(e.name||(c?`Trip Anchor`:`Day ${e.dayNumber}`))}</h3>
                            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
                                ${r>0?`<span style="background:${u?`rgba(255,255,255,0.18)`:`rgba(0,113,227,0.08)`}; color:${u?`#ffffff`:`var(--accent-blue)`}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">📸 ${r}</span>`:``}
                                ${s>0?`<span style="background:${u?`rgba(255,255,255,0.18)`:`rgba(88,86,214,0.08)`}; color:${u?`#ffffff`:`#5856d6`}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">📎 ${s}</span>`:``}
                                ${e.notes?`<span style="background:${u?`rgba(255,255,255,0.18)`:`rgba(255,149,0,0.08)`}; color:${u?`#ffffff`:`#ff9500`}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">📝 Notes</span>`:``}
                            </div>
                        </div>
                    </div>
                `}).join(``)}
        </div>

        ${(()=>{let e=e=>{if(!e)return null;let t=T.find(t=>t.id===e);return t?Number(t.dayNumber)===0?`⚓ Anchor`:`Day ${t.dayNumber}`:null},t=e=>{if(!e)return!1;let t=T.find(t=>t.id===e);return!!t&&Number(t.dayNumber)===0},n=n=>{if(t(n))return`<span style="background:rgba(52,199,89,0.12); color:#1a6b3c; padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">⚓ Anchor</span>`;let r=e(n);return r?`<span style="background:rgba(0,113,227,0.08); color:var(--accent-blue); padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${a(r)}</span>`:`<span style="background:rgba(0,0,0,0.05); color:rgba(0,0,0,0.45); padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">Unsorted</span>`},r=[];O.forEach(e=>r.push({name:e.name||`Document`,url:e.url||``,dayId:e.dayId||null,source:`trip`,_key:e.id||`${e.name}-${e.url}`})),T.forEach(e=>{(e.tickets||[]).forEach((t,n)=>r.push({name:t.name||`Document`,url:t.url||``,dayId:e.id,source:`day`,_key:`${e.id}#${n}`}))});let i=e=>{if(!e)return-1;let t=T.find(t=>t.id===e);return t?t.dayNumber:999};r.sort((e,t)=>i(e.dayId)-i(t.dayId));let o=[];D.forEach(e=>o.push({src:e.src||``,dayId:e.dayId||null,source:`trip`,_key:e.id||e.src})),T.forEach(e=>{(e.photos||[]).forEach((t,n)=>o.push({src:t,dayId:e.id,source:`day`,_key:`${e.id}#${n}`}))}),o.sort((e,t)=>i(e.dayId)-i(t.dayId));let s=e=>/^data:image\//i.test(e||``)||/\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|tiff?|svg)(\?.*)?$/i.test(e||``);return(r.length===0?``:`
                <div class="ad-section-header-row">
                    <h2 class="ad-hero-title">Documents</h2>
                    <span class="ad-text-muted-sm">${r.length} saved · click any to open</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:8px;">
                    ${r.map(e=>`
                        <a href="${a(e.url||`#`)}" target="_blank" rel="noreferrer" style="display:flex; align-items:center; gap:12px; background:white; border:1px solid rgba(0,0,0,0.07); border-radius:14px; padding:12px 14px; box-shadow: 0 2px 8px rgba(0,45,91,0.04); text-decoration:none; color:#002d5b;">
                            <span style="font-size:1.3rem; line-height:1; flex-shrink:0;">📎</span>
                            <div style="flex:1; min-width:0;">
                                <div class="flex items-center gap-2">
                                    <span style="font-weight:800; font-size:0.92rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${a(e.name)}</span>
                                    ${n(e.dayId)}
                                </div>
                                ${e.url?`<div style="font-size:0.7rem; color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${a(e.url)}</div>`:``}
                            </div>
                            <span style="color: var(--accent-blue); font-size:0.78rem; font-weight:700; flex-shrink:0;">Open ↗</span>
                        </a>
                    `).join(``)}
                </div>
            `)+(o.length===0?``:`
                <div class="ad-section-header-row">
                    <h2 class="ad-hero-title">All photos</h2>
                    <span class="ad-text-muted-sm">${o.length} saved</span>
                </div>
                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:10px; margin-bottom:24px;">
                    ${o.map(n=>{let r=e(n.dayId),i=t(n.dayId)?`rgba(52,199,89,0.85)`:`rgba(0,0,0,0.55)`,o=r?`<div style="position:absolute; top:6px; left:6px; background: ${i}; color:white; padding:2px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; backdrop-filter: blur(6px);">${a(r)}</div>`:`<div style="position:absolute; top:6px; left:6px; background: rgba(0,0,0,0.45); color:white; padding:2px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; backdrop-filter: blur(6px);">Unsorted</div>`;return s(n.src)?`<a href="${a(n.src)}" target="_blank" rel="noreferrer" style="position:relative; aspect-ratio:1; border-radius:14px; overflow:hidden; background-image:url(${a(n.src)}); background-size:cover; background-position:center; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border:1px solid rgba(0,0,0,0.06); display:block;">${o}</a>`:`<a href="${a(n.src)}" target="_blank" rel="noreferrer" style="position:relative; aspect-ratio:1; border-radius:14px; overflow:hidden; background: var(--gradient-day); box-shadow: 0 4px 12px rgba(0,113,227,0.18); border:1px solid rgba(0,0,0,0.06); display:flex; flex-direction:column; align-items:center; justify-content:center; padding:14px; text-align:center; color:white; text-decoration:none;">${o}<div style="font-size:1.8rem; line-height:1; margin-bottom:8px;">🔗</div><div style="font-size:0.7rem; font-weight:800; opacity:0.9; word-break:break-all; overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;">${a(n.src.replace(/^https?:\/\//,``))}</div></a>`}).join(``)}
                </div>
            `)})()}
    `,d.querySelector(`#backToCollectionsBtn`)?.addEventListener(`click`,()=>e(`collections`));let R=d.querySelector(`#shareTripBtn`);return R&&l(u.id).then(e=>{e?.shared&&(R.dataset.shared=`1`,R.dataset.postId=String(e.post_id),m(R,!0))}),d.addEventListener(`click`,async a=>{let o=a.target,s=o?.closest(`.restore-trip-btn`);if(s?.dataset.tripId){w(s.dataset.tripId);return}let l=o?.closest(`#cloneTripBtn`);if(l?.dataset.tripId){l.setAttribute(`disabled`,`true`);let n=l.innerHTML;l.innerHTML=`Cloning…`;try{let i=await r(l.dataset.tripId);if(!i?.ok||!i.body?.tripId){t(`Couldn't clone — try again in a moment.`),l.removeAttribute(`disabled`),l.innerHTML=n;return}let a=i.body.tripId;f.activeTripId=a,await c(),f.activeTripId=a,p(`state:changed`),t(`Trip cloned! Edit your draft on Home.`),e(`home`)}catch(e){console.error(`Clone failed:`,e),t(`Couldn't clone — try again in a moment.`),l.removeAttribute(`disabled`),l.innerHTML=n}return}let d=o?.closest(`#shareTripBtn`);if(d){h({trip:u,onShareToFeed:()=>{if(d.dataset.shared===`1`){let e=Number(d.dataset.postId||0);if(!e)return;i({title:`Unshare this trip?`,message:`It'll disappear from your friends' feeds. Any reposts of it will be removed too.`,confirmText:`Unshare`,onConfirm:async()=>{let n=await v(e);if(!n||!n.ok){t(`Couldn't unshare — try again in a moment.`);return}d.dataset.shared=`0`,d.dataset.postId=``,m(d,!1),t(`Removed from your feed.`)}});return}g(u,async e=>{let r=await n(u.id,e);if(!r||!r.ok){t(`Couldn't share — try again in a moment.`);return}let i=Number(r.body?.post_id)||0;i&&(d.dataset.shared=`1`,d.dataset.postId=String(i),m(d,!0)),r.body?.status===`already_shared`?t(e?`Updated your share.`:`Already shared to your feed.`):t(`Shared to your feed.`)})}});return}let b=o?.closest(`a[href]`);if(b&&y(b.href)){let e=a;if(!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&e.button!==1){e.preventDefault();let t=b.querySelector(`span`)?.textContent?.trim()||`Document`;S(b.href,t);return}}let x=o?.closest(`.archived-day-block`);if(x?.dataset.dayId){let e=(u.tripDays||[]).find(e=>e.id===x.dataset.dayId);e&&_(e);return}}),d.addEventListener(`change`,e=>{let t=e.target?.closest(`.trip-privacy-select`);t?.dataset.tripId&&C(t.dataset.tripId,t.value)}),d}var D=async e=>{let t=document.getElementById(`app-container`);if(!t)return;let n=f.archivedTrips.find(t=>t.id===e)||f.trips.find(t=>t.id===e);if(n){t.innerHTML=``,t.appendChild(E(n));return}t.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary); font-size:0.95rem;">${x(`collections.loadingTrip`)}</div>`;try{let n=await b(`/api/public-trip/${encodeURIComponent(e)}`);if(!n.ok){t.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">${x(`collections.tripUnavailable`)}</div>`;return}let r=await n.json();if(!r?.trip){t.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">${x(`collections.tripNotFound`)}</div>`;return}t.innerHTML=``,t.appendChild(E(r.trip))}catch(e){console.error(`viewArchivedDetails fetch failed:`,e),t.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">${x(`collections.loadFailed`)}</div>`}};export{C as i,T as n,w as r,D as t};
//# sourceMappingURL=collections-CiOXtMOC.js.map