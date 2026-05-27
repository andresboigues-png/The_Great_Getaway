import{$t as e,C as t,Ct as n,Et as r,Ft as i,H as a,Ht as o,K as s,Rt as c,Tt as l,Z as u,at as d,en as f,et as p,j as m,o as h,ot as g,qt as _,w as v,wt as y,x as b,xt as x,z as S}from"../app.bundle.js";var C=async(t,n)=>{let r=e.archivedTrips.find(e=>e.id===t)||e.trips.find(e=>e.id===t);if(r&&(r.isPublic=n!==`private`,r.publicShowExpenses=n===`public-full`,f(`state:changed`),e.user))try{await d(r)}catch{}},w=t=>{let n=e.archivedTrips.find(e=>e.id===t);n&&i({title:b(`errors.restoreTripTitle`),message:b(`errors.restoreTripBody`),confirmText:b(`errors.restoreTripConfirmBtn`),onConfirm:()=>{n.isArchived=!1,n.expenses&&(e.expenses=[...e.expenses,...n.expenses],delete n.expenses),n.tripDays&&(e.tripDays=[...e.tripDays,...n.tripDays],delete n.tripDays);let r=n.settlements;r&&r.length>0&&(e.settlements=[...e.settlements||[],...r],delete n.settlements),e.trips.push(n),e.archivedTrips=e.archivedTrips.filter(e=>e.id!==t),e.activeTripId=t,f(`state:changed`),u(t),g(`home`)}})},T=t=>{i({title:b(`errors.deleteTripTitle`),message:b(`errors.deleteTripBody`),confirmText:b(`errors.deleteTripConfirmBtn`),onConfirm:async()=>{e.archivedTrips=e.archivedTrips.filter(e=>e.id!==t),f(`state:changed`);let n=m(t);n&&n.catch(e=>console.error(`Delete archived trip failed:`,e)),g(`collections`)}})};function E(t){let u=typeof t==`string`?e.archivedTrips.find(e=>e.id===t)||e.trips.find(e=>e.id===t):t,d=document.createElement(`div`);if(!u)return d.innerHTML=`<p style="padding: 40px; text-align: center;">${c(b(`archivedDetail.notFound`))}</p>`,d;let m=(u.expenses||[]).filter(e=>!e.isSettlement),T=m.reduce((e,t)=>e+(t.euroValue||0),0),E=u.tripDays||[],D=E.filter(e=>(e.dayNumber||0)>0).length,O=Array.isArray(u.photos)?u.photos:[],k=Array.isArray(u.documents)?u.documents:[],A=E.reduce((e,t)=>e+(t.photos||[]).length,0)+O.length,j=E.reduce((e,t)=>e+(t.tickets||[]).length,0)+k.length,M=null;if(u.coverUrl&&(M=u.coverUrl),!M&&O.length>0&&(M=O[0].src),!M){for(let e of E)if(e.photos&&e.photos.length>0){M=e.photos[0];break}}let N=M?`background: linear-gradient(135deg, rgba(0,45,91,0.55), rgba(88,86,214,0.45)), url(${c(M)}) center/cover no-repeat;`:`background: linear-gradient(135deg, #007aff 0%, #5856d6 60%, #34c759 130%);`,P=`#ffffff`,F=`rgba(255,255,255,0.85)`,I=`rgba(255,255,255,0.16)`,L=`1px solid rgba(255,255,255,0.25)`,R=(e,t,n)=>`
        <div style="display:flex; align-items:center; gap:10px; background:${I}; border:${L}; padding:10px 16px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">
            <span style="font-size:1.05rem; line-height:1;">${e}</span>
            <div style="display:flex; flex-direction:column; line-height:1.05;">
                <span style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:${F};">${c(t)}</span>
                <span style="font-size:0.95rem; font-weight:800; color:${P};">${c(n)}</span>
            </div>
        </div>
    `;d.innerHTML=`
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
                <button id="backToCollectionsBtn" type="button" class="ad-pill-glass" style="background:rgba(255,255,255,0.16);">${c(b(`archivedDetail.backBtn`))}</button>
                <!-- Share button — now ALWAYS visible (no isPublic
                     gate). Opens the Share Chooser which lets the
                     user pick between "Share to feed" (in-app post,
                     still requires the trip be public) and "Get
                     share link" (public URL, no precondition). The
                     button's existence at minimum advertises that
                     completed trips ARE shareable, even if the
                     feed-share path needs the public toggle flipped
                     first. -->
                <button id="shareTripBtn" type="button" data-trip-id="${c(u.id)}" title="${c(b(`archivedDetail.shareBtnTitle`))}" aria-label="${c(b(`archivedDetail.shareBtnTitle`))}"
                    class="ad-pill-glass">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="18" cy="5" r="3"></circle>
                        <circle cx="6" cy="12" r="3"></circle>
                        <circle cx="18" cy="19" r="3"></circle>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                    </svg>
                    ${c(b(`archivedDetail.shareBtn`))}
                </button>
                <!-- §4.6 — Clone button. Available on every
                     archived trip detail (own AND fetched-via-public
                     trips). Drops a fresh draft into the user's
                     active trips with the same Path + ideas; their
                     expenses / photos / companions are NOT carried
                     over (clone is a template, not a copy). -->
                <button id="cloneTripBtn" type="button" data-trip-id="${c(u.id)}" title="${c(b(`archivedDetail.cloneBtnTitle`))}" aria-label="${c(b(`archivedDetail.cloneBtnAria`))}"
                    class="ad-pill-glass">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    ${c(b(`archivedDetail.cloneBtn`))}
                </button>
                <button class="restore-trip-btn" data-trip-id="${c(u.id)}" type="button" style="background:#ffffff; color:#002d5b; padding:10px 18px; border-radius:999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,0.18); border: 0;">${c(b(`archivedDetail.restoreBtn`))}</button>
            </div>

            <!-- Top tag chip + title block. -->
            <div style="position:relative; z-index:1; max-width: calc(100% - 260px);">
                <div style="display:inline-flex; align-items:center; gap:8px; background:${I}; border:${L}; padding:6px 14px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); margin-bottom:18px;">
                    <span style="font-size:0.85rem; line-height:1;">📚</span>
                    <span style="font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.18em; color:${P};">${c(b(`archivedDetail.heroTag`))}</span>
                </div>
                <h1 style="font-size: 3.2rem; margin: 0; letter-spacing: -0.04em; color: ${P}; font-weight: 800; line-height: 1; text-shadow: 0 2px 24px rgba(0,0,0,0.2);">${c(u.name)}</h1>
                ${u.country?`<div style="margin-top:10px; font-size:1rem; color:${F}; font-weight:600; display:flex; align-items:center; gap:8px;">📍 ${c(u.country)}</div>`:``}
            </div>

            <!-- Stat chip row. -->
            <div style="position:relative; z-index:1; display:flex; flex-wrap:wrap; gap:10px; margin-top:24px;">
                ${R(`🗓️`,b(`archivedDetail.statDays`),String(D))}
                ${A>0?R(`📸`,b(`archivedDetail.statPhotos`),String(A)):``}
                ${j>0?R(`📎`,b(`archivedDetail.statDocuments`),String(j)):``}
                ${m.length>0?R(`💰`,b(`archivedDetail.statSpent`),_(T,`EUR`)):``}

                <!-- Public-trip granularity select, styled as a chip.
                     Replaces the legacy binary toggle. Three states:
                     private / public — plan only / public — incl.
                     expenses. Members ALWAYS see expenses regardless
                     of this flag (server-side gate). -->
                <div style="display:flex; align-items:center; gap:6px; background:${I}; border:${L}; padding:6px 14px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">
                    <select
                        class="trip-privacy-select"
                        data-trip-id="${c(u.id)}"
                        aria-label="${c(b(`archivedDetail.visibilityAria`))}"
                        style="background:transparent; border:0; color:${P}; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; padding: 2px 18px 2px 4px; appearance:none; -webkit-appearance:none; cursor:pointer; outline:none; background-image: url('data:image/svg+xml;utf8,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;10&quot; height=&quot;10&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;white&quot; stroke-width=&quot;3&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><polyline points=&quot;6 9 12 15 18 9&quot;/></svg>'); background-repeat:no-repeat; background-position: right 4px center; background-size: 8px;">
                        <option value="private" ${u.isPublic?``:`selected`} class="text-brand-navy">${c(b(`archivedDetail.visibilityPrivate`))}</option>
                        <option value="public-plan" ${u.isPublic&&!u.publicShowExpenses?`selected`:``} class="text-brand-navy">${c(b(`archivedDetail.visibilityPublicPlan`))}</option>
                        <option value="public-full" ${u.isPublic&&u.publicShowExpenses?`selected`:``} class="text-brand-navy">${c(b(`archivedDetail.visibilityPublicAll`))}</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- Day grid. Each card is keyboard-accessible (role=button)
             and opens the read-only openDayView modal on click. -->
        <div style="display:flex; align-items:baseline; gap:12px; margin: 8px 4px 14px;">
            <h2 class="ad-hero-title">${c(b(`archivedDetail.journeyTitle`))}</h2>
            <span class="ad-text-muted-sm">${c(b(`archivedDetail.journeySubtitle`))}</span>
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:18px;">
            ${E.sort((e,t)=>e.dayNumber-t.dayNumber).map(e=>{let t=e.photos||[],n=O.filter(t=>t.dayId===e.id),r=t.length+n.length,i=e.tickets||[],a=k.filter(t=>t.dayId===e.id),o=i.length+a.length,s=Number(e.dayNumber)===0,l=t[0]||n[0]?.src||null,u=!!l,d=e.name?b(`archivedDetail.dayAriaWithName`,{n:e.dayNumber,name:e.name}):b(`archivedDetail.dayAria`,{n:e.dayNumber}),f=s?b(`archivedDetail.dayBadgeHub`):b(`tripMedia.dayBucketDay`,{n:e.dayNumber}),p=s?b(`archivedDetail.dayTitleHub`):b(`tripMedia.dayBucketDay`,{n:e.dayNumber});return`
                    <div class="archived-day-block" data-day-id="${c(e.id)}" role="button" tabindex="0" aria-label="${c(d)}"
                        style="position:relative; cursor:pointer; min-height:170px; border-radius:24px; padding:20px; display:flex; flex-direction:column; justify-content:space-between; transition: transform 0.35s cubic-bezier(0.16,1,0.3,1), box-shadow 0.35s cubic-bezier(0.16,1,0.3,1); ${u?`background: linear-gradient(180deg, rgba(0,45,91,0.15) 0%, rgba(0,45,91,0.78) 100%), url(${c(l)}) center/cover no-repeat; border: 1px solid rgba(0,0,0,0.08); color: white;`:`background: white; border: 1.5px solid rgba(0,113,227,0.18); color: #002d5b;`} box-shadow: 0 10px 30px rgba(0,0,0,0.06);"
                        onmouseover="this.style.transform='translateY(-6px)';this.style.boxShadow='0 24px 50px rgba(0,0,0,0.16)';"
                        onmouseout="this.style.transform='';this.style.boxShadow='0 10px 30px rgba(0,0,0,0.06)';">
                        <!-- Top: badge -->
                        <div class="flex items-center gap-2">
                            <span style="background: ${s?`rgba(52,199,89,0.95)`:`rgba(0,113,227,0.95)`}; color:white; padding: 4px 12px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.1em;">${c(f)}</span>
                        </div>
                        <!-- Bottom: name + count chips -->
                        <div>
                            <h3 style="margin:0; font-size:1.4rem; font-weight:800; letter-spacing:-0.02em; color:${u?`#ffffff`:`#002d5b`}; line-height:1.15; ${u?`text-shadow: 0 2px 12px rgba(0,0,0,0.4);`:``}">${c(e.name||p)}</h3>
                            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
                                ${r>0?`<span style="background:${u?`rgba(255,255,255,0.18)`:`rgba(0,113,227,0.08)`}; color:${u?`#ffffff`:`var(--accent-blue)`}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">📸 ${r}</span>`:``}
                                ${o>0?`<span style="background:${u?`rgba(255,255,255,0.18)`:`rgba(88,86,214,0.08)`}; color:${u?`#ffffff`:`#5856d6`}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">📎 ${o}</span>`:``}
                                ${e.notes?`<span style="background:${u?`rgba(255,255,255,0.18)`:`rgba(255,149,0,0.08)`}; color:${u?`#ffffff`:`#ff9500`}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">${c(b(`archivedDetail.notesChip`))}</span>`:``}
                            </div>
                        </div>
                    </div>
                `}).join(``)}
        </div>

        ${(()=>{let e=e=>{if(!e)return null;let t=E.find(t=>t.id===e);return t?Number(t.dayNumber)===0?b(`archivedDetail.dayBadgeHub`):b(`tripMedia.dayBucketDay`,{n:t.dayNumber}):null},t=e=>{if(!e)return!1;let t=E.find(t=>t.id===e);return!!t&&Number(t.dayNumber)===0},n=n=>{if(t(n))return`<span style="background:rgba(52,199,89,0.12); color:#1a6b3c; padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${c(b(`archivedDetail.dayBadgeHub`))}</span>`;let r=e(n);return r?`<span style="background:rgba(0,113,227,0.08); color:var(--accent-blue); padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${c(r)}</span>`:`<span style="background:rgba(0,0,0,0.05); color:rgba(0,0,0,0.45); padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${c(b(`archivedDetail.dayBucketUnsorted`))}</span>`},r=[],i=b(`tripMedia.docsFallbackName`);k.forEach(e=>r.push({name:e.name||i,url:e.url||``,dayId:e.dayId||null,source:`trip`,_key:e.id||`${e.name}-${e.url}`})),E.forEach(e=>{(e.tickets||[]).forEach((t,n)=>r.push({name:t.name||i,url:t.url||``,dayId:e.id,source:`day`,_key:`${e.id}#${n}`}))});let a=e=>{if(!e)return-1;let t=E.find(t=>t.id===e);return t?t.dayNumber:999};r.sort((e,t)=>a(e.dayId)-a(t.dayId));let o=[];O.forEach(e=>o.push({src:e.src||``,dayId:e.dayId||null,source:`trip`,_key:e.id||e.src})),E.forEach(e=>{(e.photos||[]).forEach((t,n)=>o.push({src:t,dayId:e.id,source:`day`,_key:`${e.id}#${n}`}))}),o.sort((e,t)=>a(e.dayId)-a(t.dayId));let s=e=>/^data:image\//i.test(e||``)||/\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|tiff?|svg)(\?.*)?$/i.test(e||``);return(r.length===0?``:`
                <div class="ad-section-header-row">
                    <h2 class="ad-hero-title">${c(b(`archivedDetail.docsTitle`))}</h2>
                    <span class="ad-text-muted-sm">${c(b(`archivedDetail.docsSubtitle`,{count:r.length}))}</span>
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
                            <span style="color: var(--accent-blue); font-size:0.78rem; font-weight:700; flex-shrink:0;">${c(b(`archivedDetail.docOpenAction`))}</span>
                        </a>
                    `).join(``)}
                </div>
            `)+(o.length===0?``:`
                <div class="ad-section-header-row">
                    <h2 class="ad-hero-title">${c(b(`archivedDetail.allPhotosTitle`))}</h2>
                    <span class="ad-text-muted-sm">${c(b(`archivedDetail.allPhotosSubtitle`,{count:o.length}))}</span>
                </div>
                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:10px; margin-bottom:24px;">
                    ${o.map(n=>{let r=e(n.dayId),i=t(n.dayId)?`rgba(52,199,89,0.85)`:`rgba(0,0,0,0.55)`,a=r?`<div style="position:absolute; top:6px; left:6px; background: ${i}; color:white; padding:2px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; backdrop-filter: blur(6px);">${c(r)}</div>`:`<div style="position:absolute; top:6px; left:6px; background: rgba(0,0,0,0.45); color:white; padding:2px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; backdrop-filter: blur(6px);">${c(b(`archivedDetail.dayBucketUnsorted`))}</div>`;return s(n.src)?`<a href="${c(n.src)}" target="_blank" rel="noreferrer" style="position:relative; aspect-ratio:1; border-radius:14px; overflow:hidden; background-image:url(${c(n.src)}); background-size:cover; background-position:center; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border:1px solid rgba(0,0,0,0.06); display:block;">${a}</a>`:`<a href="${c(n.src)}" target="_blank" rel="noreferrer" style="position:relative; aspect-ratio:1; border-radius:14px; overflow:hidden; background: var(--gradient-day); box-shadow: 0 4px 12px rgba(0,113,227,0.18); border:1px solid rgba(0,0,0,0.06); display:flex; flex-direction:column; align-items:center; justify-content:center; padding:14px; text-align:center; color:white; text-decoration:none;">${a}<div style="font-size:1.8rem; line-height:1; margin-bottom:8px;">🔗</div><div style="font-size:0.7rem; font-weight:800; opacity:0.9; word-break:break-all; overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;">${c(n.src.replace(/^https?:\/\//,``))}</div></a>`}).join(``)}
                </div>
            `)})()}
    `,d.querySelector(`#backToCollectionsBtn`)?.addEventListener(`click`,()=>g(`collections`));let z=d.querySelector(`#shareTripBtn`);return z&&S(u.id).then(e=>{e?.shared&&(z.dataset.shared=`1`,z.dataset.postId=String(e.post_id),y(z,!0))}),d.addEventListener(`click`,async t=>{let d=t.target,m=d?.closest(`.restore-trip-btn`);if(m?.dataset.tripId){w(m.dataset.tripId);return}let _=d?.closest(`#cloneTripBtn`);if(_?.dataset.tripId){_.setAttribute(`disabled`,`true`);let t=_.innerHTML;_.innerHTML=c(b(`archivedDetail.cloneStatusCloning`));try{let n=await v(_.dataset.tripId);if(!n?.ok||!n.body?.tripId){o(b(`archivedDetail.cloneError`)),_.removeAttribute(`disabled`),_.innerHTML=t;return}let r=n.body.tripId;e.activeTripId=r,await a(),e.activeTripId=r,f(`state:changed`),o(b(`archivedDetail.cloneSuccess`)),g(`home`)}catch(e){console.error(`Clone failed:`,e),o(b(`archivedDetail.cloneError`)),_.removeAttribute(`disabled`),_.innerHTML=t}return}let S=d?.closest(`#shareTripBtn`);if(S){h({trip:u,onShareToFeed:()=>{if(S.dataset.shared===`1`){let e=Number(S.dataset.postId||0);if(!e)return;i({title:b(`archivedDetail.unshareConfirmTitle`),message:b(`archivedDetail.unshareConfirmBody`),confirmText:b(`archivedDetail.unshareConfirmBtn`),onConfirm:async()=>{let t=await p(e);if(!t||!t.ok){o(b(`archivedDetail.unshareError`));return}S.dataset.shared=`0`,S.dataset.postId=``,y(S,!1),o(b(`archivedDetail.unshareSuccess`))}});return}n(u,async e=>{let t=await s(u.id,e);if(!t||!t.ok){let e=t?.status??`no-response`,n=t?.body?.error||``;o(`Share failed — HTTP ${e}`+(n?` · ${n}`:``)),console.error(`[collections.share] failed`,{tripId:u.id,status:e,body:t?.body});return}let n=Number(t.body?.post_id)||0;n&&(S.dataset.shared=`1`,S.dataset.postId=String(n),y(S,!0)),t.body?.status===`already_shared`?o(b(e?`archivedDetail.shareUpdated`:`archivedDetail.shareAlready`)):o(b(`archivedDetail.shareSuccess`))})}});return}let C=d?.closest(`a[href]`);if(C&&l(C.href)){let e=t;if(!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&e.button!==1){e.preventDefault();let t=C.querySelector(`span`)?.textContent?.trim()||`Document`;r(C.href,t);return}}let T=d?.closest(`.archived-day-block`);if(T?.dataset.dayId){let e=(u.tripDays||[]).find(e=>e.id===T.dataset.dayId);e&&x(e);return}}),d.addEventListener(`change`,e=>{let t=e.target?.closest(`.trip-privacy-select`);t?.dataset.tripId&&C(t.dataset.tripId,t.value)}),d}var D=async n=>{let r=document.getElementById(`app-container`);if(!r)return;let i=e.archivedTrips.find(e=>e.id===n)||e.trips.find(e=>e.id===n);if(i){r.innerHTML=``,r.appendChild(E(i));return}r.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary); font-size:0.95rem;">${b(`collections.loadingTrip`)}</div>`;try{let e=await t(`/api/public-trip/${encodeURIComponent(n)}`);if(!e.ok){r.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">${b(`collections.tripUnavailable`)}</div>`;return}let i=await e.json();if(!i?.trip){r.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">${b(`collections.tripNotFound`)}</div>`;return}r.innerHTML=``,r.appendChild(E(i.trip))}catch(e){console.error(`viewArchivedDetails fetch failed:`,e),r.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">${b(`collections.loadFailed`)}</div>`}};export{C as i,T as n,w as r,D as t};
//# sourceMappingURL=collections-RFXwhoMF.js.map