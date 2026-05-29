import{B as e,C as t,Dt as n,Et as r,It as i,Jt as a,Q as o,St as s,Tt as c,U as l,Ut as u,en as d,j as f,o as p,ot as m,q as h,st as g,tn as _,tt as v,w as y,wt as b,x,z as S,zt as C}from"../app.bundle.js";var w=async(e,t)=>{let n=d.archivedTrips.find(t=>t.id===e)||d.trips.find(t=>t.id===e);if(n&&(n.isPublic=t!==`private`,n.publicShowExpenses=t===`public-full`,_(`state:changed`),d.user))try{await m(n)}catch{}},T=e=>{let t=d.archivedTrips.find(t=>t.id===e);t&&i({title:x(`errors.restoreTripTitle`),message:x(`errors.restoreTripBody`),confirmText:x(`errors.restoreTripConfirmBtn`),onConfirm:()=>{t.isArchived=!1,t.expenses&&(d.expenses=[...d.expenses,...t.expenses],delete t.expenses),t.tripDays&&(d.tripDays=[...d.tripDays,...t.tripDays],delete t.tripDays);let n=t.settlements;n&&n.length>0&&(d.settlements=[...d.settlements||[],...n],delete t.settlements),d.trips.push(t),d.archivedTrips=d.archivedTrips.filter(t=>t.id!==e),d.activeTripId=e,_(`state:changed`),o(e),g(`home`)}})},E=e=>{i({title:x(`errors.deleteTripTitle`),message:x(`errors.deleteTripBody`),confirmText:x(`errors.deleteTripConfirmBtn`),onConfirm:async()=>{d.archivedTrips=d.archivedTrips.filter(t=>t.id!==e),_(`state:changed`);let t=f(e);t&&t.catch(e=>console.error(`Delete archived trip failed:`,e)),g(`collections`)}})};function D(e){let t=typeof e==`string`?d.archivedTrips.find(t=>t.id===e)||d.trips.find(t=>t.id===e):e,o=document.createElement(`div`);if(!t)return o.innerHTML=`<p style="padding: 40px; text-align: center;">${C(x(`archivedDetail.notFound`))}</p>`,o;let f=(t.expenses||[]).filter(e=>!e.isSettlement),m=f.reduce((e,t)=>e+(t.euroValue||0),0),E=t.tripDays||[],D=E.filter(e=>(e.dayNumber||0)>0).length,O=Array.isArray(t.photos)?t.photos:[],k=Array.isArray(t.documents)?t.documents:[],A=E.reduce((e,t)=>e+(t.photos||[]).length,0)+O.length,j=E.reduce((e,t)=>e+(t.tickets||[]).length,0)+k.length,M=null;if(t.coverUrl&&(M=t.coverUrl),!M&&O.length>0&&(M=O[0].src),!M){for(let e of E)if(e.photos&&e.photos.length>0){M=e.photos[0];break}}let N=M?`background: linear-gradient(135deg, rgba(0,45,91,0.55), rgba(88,86,214,0.45)), url(${C(M)}) center/cover no-repeat;`:`background: linear-gradient(135deg, #007aff 0%, #5856d6 60%, #34c759 130%);`,P=`#ffffff`,F=`rgba(255,255,255,0.85)`,I=`rgba(255,255,255,0.16)`,L=`1px solid rgba(255,255,255,0.25)`,R=(e,t,n)=>`
        <div style="display:flex; align-items:center; gap:10px; background:${I}; border:${L}; padding:10px 16px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">
            <span style="font-size:1.05rem; line-height:1;">${e}</span>
            <div style="display:flex; flex-direction:column; line-height:1.05;">
                <span style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:${F};">${C(t)}</span>
                <span style="font-size:0.95rem; font-weight:800; color:${P};">${C(n)}</span>
            </div>
        </div>
    `;o.innerHTML=`
        <div class="archived-hero" style="position:relative; overflow:hidden; border-radius:36px; padding:48px 52px; ${N} box-shadow: 0 30px 80px rgba(0, 45, 91, 0.25); margin-bottom: 32px; border: 1px solid rgba(255,255,255,0.18);">
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
            <div class="archived-hero__actions">
                <button id="backToCollectionsBtn" type="button" class="ad-pill-glass" style="background:rgba(255,255,255,0.16);">${C(x(`archivedDetail.backBtn`))}</button>
                <!-- Share button — now ALWAYS visible (no isPublic
                     gate). Opens the Share Chooser which lets the
                     user pick between "Share to feed" (in-app post,
                     still requires the trip be public) and "Get
                     share link" (public URL, no precondition). The
                     button's existence at minimum advertises that
                     completed trips ARE shareable, even if the
                     feed-share path needs the public toggle flipped
                     first. -->
                <button id="shareTripBtn" type="button" data-trip-id="${C(t.id)}" title="${C(x(`archivedDetail.shareBtnTitle`))}" aria-label="${C(x(`archivedDetail.shareBtnTitle`))}"
                    class="ad-pill-glass">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="18" cy="5" r="3"></circle>
                        <circle cx="6" cy="12" r="3"></circle>
                        <circle cx="18" cy="19" r="3"></circle>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                    </svg>
                    ${C(x(`archivedDetail.shareBtn`))}
                </button>
                <!-- §4.6 — Clone button. Available on every
                     archived trip detail (own AND fetched-via-public
                     trips). Drops a fresh draft into the user's
                     active trips with the same Path + ideas; their
                     expenses / photos / companions are NOT carried
                     over (clone is a template, not a copy). -->
                <button id="cloneTripBtn" type="button" data-trip-id="${C(t.id)}" title="${C(x(`archivedDetail.cloneBtnTitle`))}" aria-label="${C(x(`archivedDetail.cloneBtnAria`))}"
                    class="ad-pill-glass">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    ${C(x(`archivedDetail.cloneBtn`))}
                </button>
                <button class="restore-trip-btn" data-trip-id="${C(t.id)}" type="button" style="background:#ffffff; color:#002d5b; padding:10px 18px; border-radius:999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,0.18); border: 0;">${C(x(`archivedDetail.restoreBtn`))}</button>
            </div>

            <!-- Top tag chip + title block. -->
            <div style="position:relative; z-index:1; max-width: calc(100% - 260px);">
                <div style="display:inline-flex; align-items:center; gap:8px; background:${I}; border:${L}; padding:6px 14px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); margin-bottom:18px;">
                    <span style="font-size:0.85rem; line-height:1;">📚</span>
                    <span style="font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.18em; color:${P};">${C(x(`archivedDetail.heroTag`))}</span>
                </div>
                <h1 style="font-size: 3.2rem; margin: 0; letter-spacing: -0.04em; color: ${P}; font-weight: 800; line-height: 1; text-shadow: 0 2px 24px rgba(0,0,0,0.2);">${C(t.name)}</h1>
                ${t.country?`<div style="margin-top:10px; font-size:1rem; color:${F}; font-weight:600; display:flex; align-items:center; gap:8px;">📍 ${C(t.country)}</div>`:``}
            </div>

            <!-- Stat chip row. -->
            <div style="position:relative; z-index:1; display:flex; flex-wrap:wrap; gap:10px; margin-top:24px;">
                ${R(`🗓️`,x(`archivedDetail.statDays`),String(D))}
                ${A>0?R(`📸`,x(`archivedDetail.statPhotos`),String(A)):``}
                ${j>0?R(`📎`,x(`archivedDetail.statDocuments`),String(j)):``}
                ${f.length>0?R(`💰`,x(`archivedDetail.statSpent`),a(m,`EUR`)):``}

                <!-- Public-trip granularity select, styled as a chip.
                     Replaces the legacy binary toggle. Three states:
                     private / public — plan only / public — incl.
                     expenses. Members ALWAYS see expenses regardless
                     of this flag (server-side gate). -->
                <div style="display:flex; align-items:center; gap:6px; background:${I}; border:${L}; padding:6px 14px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">
                    <select
                        class="trip-privacy-select"
                        data-trip-id="${C(t.id)}"
                        aria-label="${C(x(`archivedDetail.visibilityAria`))}"
                        style="background:transparent; border:0; color:${P}; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; padding: 2px 18px 2px 4px; appearance:none; -webkit-appearance:none; cursor:pointer; outline:none; background-image: url('data:image/svg+xml;utf8,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;10&quot; height=&quot;10&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;white&quot; stroke-width=&quot;3&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><polyline points=&quot;6 9 12 15 18 9&quot;/></svg>'); background-repeat:no-repeat; background-position: right 4px center; background-size: 8px;">
                        <option value="private" ${t.isPublic?``:`selected`} class="text-brand-navy">${C(x(`archivedDetail.visibilityPrivate`))}</option>
                        <option value="public-plan" ${t.isPublic&&!t.publicShowExpenses?`selected`:``} class="text-brand-navy">${C(x(`archivedDetail.visibilityPublicPlan`))}</option>
                        <option value="public-full" ${t.isPublic&&t.publicShowExpenses?`selected`:``} class="text-brand-navy">${C(x(`archivedDetail.visibilityPublicAll`))}</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- Day grid. Each card is keyboard-accessible (role=button)
             and opens the read-only openDayView modal on click. -->
        <div style="display:flex; align-items:baseline; gap:12px; margin: 8px 4px 14px;">
            <h2 class="ad-hero-title">${C(x(`archivedDetail.journeyTitle`))}</h2>
            <span class="ad-text-muted-sm">${C(x(`archivedDetail.journeySubtitle`))}</span>
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:18px;">
            ${E.sort((e,t)=>e.dayNumber-t.dayNumber).map(e=>{let t=e.photos||[],n=O.filter(t=>t.dayId===e.id),r=t.length+n.length,i=e.tickets||[],a=k.filter(t=>t.dayId===e.id),o=i.length+a.length,s=Number(e.dayNumber)===0,c=t[0]||n[0]?.src||null,l=!!c,u=e.name?x(`archivedDetail.dayAriaWithName`,{n:e.dayNumber,name:e.name}):x(`archivedDetail.dayAria`,{n:e.dayNumber}),d=s?x(`archivedDetail.dayBadgeHub`):x(`tripMedia.dayBucketDay`,{n:e.dayNumber}),f=s?x(`archivedDetail.dayTitleHub`):x(`tripMedia.dayBucketDay`,{n:e.dayNumber});return`
                    <div class="archived-day-block" data-day-id="${C(e.id)}" role="button" tabindex="0" aria-label="${C(u)}"
                        style="position:relative; cursor:pointer; min-height:170px; border-radius:24px; padding:20px; display:flex; flex-direction:column; justify-content:space-between; transition: transform 0.35s cubic-bezier(0.16,1,0.3,1), box-shadow 0.35s cubic-bezier(0.16,1,0.3,1); ${l?`background: linear-gradient(180deg, rgba(0,45,91,0.15) 0%, rgba(0,45,91,0.78) 100%), url(${C(c)}) center/cover no-repeat; border: 1px solid rgba(0,0,0,0.08); color: white;`:`background: white; border: 1.5px solid rgba(0,113,227,0.18); color: #002d5b;`} box-shadow: 0 10px 30px rgba(0,0,0,0.06);"
                        onmouseover="this.style.transform='translateY(-6px)';this.style.boxShadow='0 24px 50px rgba(0,0,0,0.16)';"
                        onmouseout="this.style.transform='';this.style.boxShadow='0 10px 30px rgba(0,0,0,0.06)';">
                        <!-- Top: badge -->
                        <div class="flex items-center gap-2">
                            <span style="background: ${s?`rgba(52,199,89,0.95)`:`rgba(0,113,227,0.95)`}; color:white; padding: 4px 12px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.1em;">${C(d)}</span>
                        </div>
                        <!-- Bottom: name + count chips -->
                        <div>
                            <h3 style="margin:0; font-size:1.4rem; font-weight:800; letter-spacing:-0.02em; color:${l?`#ffffff`:`#002d5b`}; line-height:1.15; ${l?`text-shadow: 0 2px 12px rgba(0,0,0,0.4);`:``}">${C(e.name||f)}</h3>
                            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
                                ${r>0?`<span style="background:${l?`rgba(255,255,255,0.18)`:`rgba(0,113,227,0.08)`}; color:${l?`#ffffff`:`var(--accent-blue)`}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">📸 ${r}</span>`:``}
                                ${o>0?`<span style="background:${l?`rgba(255,255,255,0.18)`:`rgba(88,86,214,0.08)`}; color:${l?`#ffffff`:`#5856d6`}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">📎 ${o}</span>`:``}
                                ${e.notes?`<span style="background:${l?`rgba(255,255,255,0.18)`:`rgba(255,149,0,0.08)`}; color:${l?`#ffffff`:`#ff9500`}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">${C(x(`archivedDetail.notesChip`))}</span>`:``}
                            </div>
                        </div>
                    </div>
                `}).join(``)}
        </div>

        ${(()=>{let e=e=>{if(!e)return null;let t=E.find(t=>t.id===e);return t?Number(t.dayNumber)===0?x(`archivedDetail.dayBadgeHub`):x(`tripMedia.dayBucketDay`,{n:t.dayNumber}):null},t=e=>{if(!e)return!1;let t=E.find(t=>t.id===e);return!!t&&Number(t.dayNumber)===0},n=n=>{if(t(n))return`<span style="background:rgba(52,199,89,0.12); color:#1a6b3c; padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${C(x(`archivedDetail.dayBadgeHub`))}</span>`;let r=e(n);return r?`<span style="background:rgba(0,113,227,0.08); color:var(--accent-blue); padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${C(r)}</span>`:`<span style="background:rgba(0,0,0,0.05); color:rgba(0,0,0,0.45); padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${C(x(`archivedDetail.dayBucketUnsorted`))}</span>`},r=[],i=x(`tripMedia.docsFallbackName`);k.forEach(e=>r.push({name:e.name||i,url:e.url||``,dayId:e.dayId||null,source:`trip`,_key:e.id||`${e.name}-${e.url}`})),E.forEach(e=>{(e.tickets||[]).forEach((t,n)=>r.push({name:t.name||i,url:t.url||``,dayId:e.id,source:`day`,_key:`${e.id}#${n}`}))});let a=e=>{if(!e)return-1;let t=E.find(t=>t.id===e);return t?t.dayNumber:999};r.sort((e,t)=>a(e.dayId)-a(t.dayId));let o=[];O.forEach(e=>o.push({src:e.src||``,dayId:e.dayId||null,source:`trip`,_key:e.id||e.src})),E.forEach(e=>{(e.photos||[]).forEach((t,n)=>o.push({src:t,dayId:e.id,source:`day`,_key:`${e.id}#${n}`}))}),o.sort((e,t)=>a(e.dayId)-a(t.dayId));let s=e=>/^data:image\//i.test(e||``)||/\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|tiff?|svg)(\?.*)?$/i.test(e||``);return(r.length===0?``:`
                <div class="ad-section-header-row">
                    <h2 class="ad-hero-title">${C(x(`archivedDetail.docsTitle`))}</h2>
                    <span class="ad-text-muted-sm">${C(x(`archivedDetail.docsSubtitle`,{count:r.length}))}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:8px;">
                    ${r.map(e=>`
                        <a href="${C(e.url||`#`)}" target="_blank" rel="noreferrer" style="display:flex; align-items:center; gap:12px; background:white; border:1px solid rgba(0,0,0,0.07); border-radius:14px; padding:12px 14px; box-shadow: 0 2px 8px rgba(0,45,91,0.04); text-decoration:none; color:#002d5b;">
                            <span style="font-size:1.3rem; line-height:1; flex-shrink:0;">📎</span>
                            <div style="flex:1; min-width:0;">
                                <div class="flex items-center gap-2">
                                    <span style="font-weight:800; font-size:0.92rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${C(e.name)}</span>
                                    ${n(e.dayId)}
                                </div>
                                ${e.url?`<div style="font-size:0.7rem; color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${C(e.url)}</div>`:``}
                            </div>
                            <span style="color: var(--accent-blue); font-size:0.78rem; font-weight:700; flex-shrink:0;">${C(x(`archivedDetail.docOpenAction`))}</span>
                        </a>
                    `).join(``)}
                </div>
            `)+(o.length===0?``:`
                <div class="ad-section-header-row">
                    <h2 class="ad-hero-title">${C(x(`archivedDetail.allPhotosTitle`))}</h2>
                    <span class="ad-text-muted-sm">${C(x(`archivedDetail.allPhotosSubtitle`,{count:o.length}))}</span>
                </div>
                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:10px; margin-bottom:24px;">
                    ${o.map(n=>{let r=e(n.dayId),i=t(n.dayId)?`rgba(52,199,89,0.85)`:`rgba(0,0,0,0.55)`,a=r?`<div style="position:absolute; top:6px; left:6px; background: ${i}; color:white; padding:2px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; backdrop-filter: blur(6px);">${C(r)}</div>`:`<div style="position:absolute; top:6px; left:6px; background: rgba(0,0,0,0.45); color:white; padding:2px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; backdrop-filter: blur(6px);">${C(x(`archivedDetail.dayBucketUnsorted`))}</div>`;return s(n.src)?`<a href="${C(n.src)}" target="_blank" rel="noreferrer" style="position:relative; aspect-ratio:1; border-radius:14px; overflow:hidden; background-image:url(${C(n.src)}); background-size:cover; background-position:center; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border:1px solid rgba(0,0,0,0.06); display:block;">${a}</a>`:`<a href="${C(n.src)}" target="_blank" rel="noreferrer" style="position:relative; aspect-ratio:1; border-radius:14px; overflow:hidden; background: var(--gradient-day); box-shadow: 0 4px 12px rgba(0,113,227,0.18); border:1px solid rgba(0,0,0,0.06); display:flex; flex-direction:column; align-items:center; justify-content:center; padding:14px; text-align:center; color:white; text-decoration:none;">${a}<div style="font-size:1.8rem; line-height:1; margin-bottom:8px;">🔗</div><div style="font-size:0.7rem; font-weight:800; opacity:0.9; word-break:break-all; overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;">${C(n.src.replace(/^https?:\/\//,``))}</div></a>`}).join(``)}
                </div>
            `)})()}
    `,o.querySelector(`#backToCollectionsBtn`)?.addEventListener(`click`,()=>g(`collections`));let z=o.querySelector(`#shareTripBtn`);return z&&S(t.id).then(e=>{e?.shared&&(z.dataset.shared=`1`,z.dataset.postId=String(e.post_id),c(z,!0))}),o.addEventListener(`click`,async e=>{let a=e.target,o=a?.closest(`.restore-trip-btn`);if(o?.dataset.tripId){T(o.dataset.tripId);return}let f=a?.closest(`#cloneTripBtn`);if(f?.dataset.tripId){f.setAttribute(`disabled`,`true`);let e=f.innerHTML;f.innerHTML=C(x(`archivedDetail.cloneStatusCloning`));try{let t=await y(f.dataset.tripId);if(!t?.ok||!t.body?.tripId){u(x(`archivedDetail.cloneError`)),f.removeAttribute(`disabled`),f.innerHTML=e;return}let n=t.body.tripId;d.activeTripId=n,await l(),d.activeTripId=n,_(`state:changed`),u(x(`archivedDetail.cloneSuccess`)),g(`home`)}catch(t){console.error(`Clone failed:`,t),u(x(`archivedDetail.cloneError`)),f.removeAttribute(`disabled`),f.innerHTML=e}return}let m=a?.closest(`#shareTripBtn`);if(m){p({trip:t,onShareToFeed:()=>{if(m.dataset.shared===`1`){let e=Number(m.dataset.postId||0);if(!e)return;i({title:x(`archivedDetail.unshareConfirmTitle`),message:x(`archivedDetail.unshareConfirmBody`),confirmText:x(`archivedDetail.unshareConfirmBtn`),onConfirm:async()=>{let t=await v(e);if(!t||!t.ok){u(x(`archivedDetail.unshareError`));return}m.dataset.shared=`0`,m.dataset.postId=``,c(m,!1),u(x(`archivedDetail.unshareSuccess`))}});return}b(t,async e=>{let n=await h(t.id,e);if(!n||!n.ok){let e=n?.status??`no-response`,r=n?.body?.error||``;u(`Share failed — HTTP ${e}`+(r?` · ${r}`:``)),console.error(`[collections.share] failed`,{tripId:t.id,status:e,body:n?.body});return}let r=Number(n.body?.post_id)||0;r&&(m.dataset.shared=`1`,m.dataset.postId=String(r),c(m,!0)),n.body?.status===`already_shared`?u(x(e?`archivedDetail.shareUpdated`:`archivedDetail.shareAlready`)):u(x(`archivedDetail.shareSuccess`))})}});return}let S=a?.closest(`a[href]`);if(S&&r(S.href)){let t=e;if(!t.metaKey&&!t.ctrlKey&&!t.shiftKey&&t.button!==1){t.preventDefault();let e=S.querySelector(`span`)?.textContent?.trim()||`Document`;n(S.href,e);return}}let w=a?.closest(`.archived-day-block`);if(w?.dataset.dayId){let e=(t.tripDays||[]).find(e=>e.id===w.dataset.dayId);e&&s(e);return}}),o.addEventListener(`change`,e=>{let t=e.target?.closest(`.trip-privacy-select`);t?.dataset.tripId&&w(t.dataset.tripId,t.value)}),o}var O=async n=>{let r=document.getElementById(`app-container`);if(!r)return;let i=d.archivedTrips.find(e=>e.id===n)||d.trips.find(e=>e.id===n);if(i){await e(n),r.innerHTML=``,r.appendChild(D(i));return}r.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary); font-size:0.95rem;">${x(`collections.loadingTrip`)}</div>`;try{let e=await t(`/api/public-trip/${encodeURIComponent(n)}`);if(!e.ok){r.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">${x(`collections.tripUnavailable`)}</div>`;return}let i=await e.json();if(!i?.trip){r.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">${x(`collections.tripNotFound`)}</div>`;return}r.innerHTML=``,r.appendChild(D(i.trip))}catch(e){console.error(`viewArchivedDetails fetch failed:`,e),r.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">${x(`collections.loadFailed`)}</div>`}};export{w as i,E as n,T as r,O as t};
//# sourceMappingURL=collections-jMD-HacO.js.map