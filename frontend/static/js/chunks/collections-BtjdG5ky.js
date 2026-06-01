import{$ as e,$t as t,B as n,Bt as r,Ct as i,Dt as a,Et as o,J as s,Jt as c,Lt as l,M as u,Ot as d,S as f,T as p,Tt as m,Ut as h,V as g,W as _,an as v,ct as y,nt as b,o as x,on as S,st as C,w}from"../app.bundle.js";var T=async(e,t)=>{let n=v.archivedTrips.find(t=>t.id===e)||v.trips.find(t=>t.id===e);if(n&&(n.isPublic=t!==`private`,n.publicShowExpenses=t===`public-full`,S(`state:changed`),v.user))try{await C(n)}catch{}},E=t=>{let n=v.archivedTrips.find(e=>e.id===t);n&&l({title:f(`errors.restoreTripTitle`),message:f(`errors.restoreTripBody`),confirmText:f(`errors.restoreTripConfirmBtn`),onConfirm:async()=>{n.isArchived=!1,n.expenses&&(v.expenses=[...v.expenses,...n.expenses],delete n.expenses),n.tripDays&&(v.tripDays=[...v.tripDays,...n.tripDays],delete n.tripDays);let r=n.settlements;r&&r.length>0&&(v.settlements=[...v.settlements||[],...r],delete n.settlements),v.trips.push(n),v.archivedTrips=v.archivedTrips.filter(e=>e.id!==t),v.activeTripId=t,S(`state:changed`);try{await e(t)}catch{}y(`home`)}})},D=e=>{l({title:f(`errors.deleteTripTitle`),message:f(`errors.deleteTripBody`),confirmText:f(`errors.deleteTripConfirmBtn`),onConfirm:async()=>{v.archivedTrips=v.archivedTrips.filter(t=>t.id!==e),S(`state:changed`);try{await u(e)}catch(e){console.error(`Delete archived trip failed:`,e)}y(`collections`)}})};function O(e){let u=typeof e==`string`?v.archivedTrips.find(t=>t.id===e)||v.trips.find(t=>t.id===e):e,g=document.createElement(`div`);if(!u)return g.innerHTML=`<p style="padding: 40px; text-align: center;">${h(f(`archivedDetail.notFound`))}</p>`,g;let C=(u.expenses||[]).filter(e=>!e.isSettlement),w=C.reduce((e,t)=>e+(t.euroValue||0),0),D=u.tripDays||[],O=D.filter(e=>(e.dayNumber||0)>0).length,k=Array.isArray(u.photos)?u.photos:[],A=Array.isArray(u.documents)?u.documents:[],j=D.reduce((e,t)=>e+(t.photos||[]).length,0)+k.length,M=D.reduce((e,t)=>e+(t.tickets||[]).length,0)+A.length,N=null;if(u.coverUrl&&(N=u.coverUrl),!N&&k.length>0&&(N=k[0].src),!N){for(let e of D)if(e.photos&&e.photos.length>0){N=e.photos[0];break}}let P=N?`background: linear-gradient(135deg, rgba(0,45,91,0.55), rgba(88,86,214,0.45)), url(${h(N)}) center/cover no-repeat;`:`background: linear-gradient(135deg, #007aff 0%, #5856d6 60%, #34c759 130%);`,F=`#ffffff`,I=`rgba(255,255,255,0.85)`,L=`rgba(255,255,255,0.16)`,R=`1px solid rgba(255,255,255,0.25)`,z=(e,t,n)=>`
        <div style="display:flex; align-items:center; gap:10px; background:${L}; border:${R}; padding:10px 16px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">
            <span style="font-size:1.05rem; line-height:1;">${e}</span>
            <div style="display:flex; flex-direction:column; line-height:1.05;">
                <span style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:${I};">${h(t)}</span>
                <span style="font-size:0.95rem; font-weight:800; color:${F};">${h(n)}</span>
            </div>
        </div>
    `;g.innerHTML=`
        <div class="archived-hero" style="position:relative; overflow:hidden; border-radius:36px; padding:48px 52px; ${P} box-shadow: 0 30px 80px rgba(0, 45, 91, 0.25); margin-bottom: 32px; border: 1px solid rgba(255,255,255,0.18);">
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
                <button id="backToCollectionsBtn" type="button" class="ad-pill-glass" style="background:rgba(255,255,255,0.16);">${h(f(`archivedDetail.backBtn`))}</button>
                <!-- Share button — now ALWAYS visible (no isPublic
                     gate). Opens the Share Chooser which lets the
                     user pick between "Share to feed" (in-app post,
                     still requires the trip be public) and "Get
                     share link" (public URL, no precondition). The
                     button's existence at minimum advertises that
                     completed trips ARE shareable, even if the
                     feed-share path needs the public toggle flipped
                     first. -->
                <button id="shareTripBtn" type="button" data-trip-id="${h(u.id)}" title="${h(f(`archivedDetail.shareBtnTitle`))}" aria-label="${h(f(`archivedDetail.shareBtnTitle`))}"
                    class="ad-pill-glass">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="18" cy="5" r="3"></circle>
                        <circle cx="6" cy="12" r="3"></circle>
                        <circle cx="18" cy="19" r="3"></circle>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                    </svg>
                    ${h(f(`archivedDetail.shareBtn`))}
                </button>
                <!-- §4.6 — Clone button. Available on every
                     archived trip detail (own AND fetched-via-public
                     trips). Drops a fresh draft into the user's
                     active trips with the same Path + ideas; their
                     expenses / photos / companions are NOT carried
                     over (clone is a template, not a copy). -->
                <button id="cloneTripBtn" type="button" data-trip-id="${h(u.id)}" title="${h(f(`archivedDetail.cloneBtnTitle`))}" aria-label="${h(f(`archivedDetail.cloneBtnAria`))}"
                    class="ad-pill-glass">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    ${h(f(`archivedDetail.cloneBtn`))}
                </button>
                <button class="restore-trip-btn" data-trip-id="${h(u.id)}" type="button" style="background:#ffffff; color:#002d5b; padding:10px 18px; border-radius:999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,0.18); border: 0;">${h(f(`archivedDetail.restoreBtn`))}</button>
            </div>

            <!-- Top tag chip + title block. -->
            <div style="position:relative; z-index:1; max-width: calc(100% - 260px);">
                <div style="display:inline-flex; align-items:center; gap:8px; background:${L}; border:${R}; padding:6px 14px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); margin-bottom:18px;">
                    <span style="font-size:0.85rem; line-height:1;">📚</span>
                    <span style="font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.18em; color:${F};">${h(f(`archivedDetail.heroTag`))}</span>
                </div>
                <h1 style="font-size: 3.2rem; margin: 0; letter-spacing: -0.04em; color: ${F}; font-weight: 800; line-height: 1; text-shadow: 0 2px 24px rgba(0,0,0,0.2);">${h(u.name)}</h1>
                ${u.country?`<div style="margin-top:10px; font-size:1rem; color:${I}; font-weight:600; display:flex; align-items:center; gap:8px;">${r(`pin`,{size:16})}${h(u.country)}</div>`:``}
            </div>

            <!-- Stat chip row. -->
            <div style="position:relative; z-index:1; display:flex; flex-wrap:wrap; gap:10px; margin-top:24px;">
                ${z(r(`calendar`,{size:17}),f(`archivedDetail.statDays`),String(O))}
                ${j>0?z(r(`photo`,{size:17}),f(`archivedDetail.statPhotos`),String(j)):``}
                ${M>0?z(r(`document`,{size:17}),f(`archivedDetail.statDocuments`),String(M)):``}
                ${C.length>0?z(r(`wallet`,{size:17}),f(`archivedDetail.statSpent`),t(w,`EUR`)):``}

                <!-- Public-trip granularity select, styled as a chip.
                     Replaces the legacy binary toggle. Three states:
                     private / public — plan only / public — incl.
                     expenses. Members ALWAYS see expenses regardless
                     of this flag (server-side gate). -->
                <div style="display:flex; align-items:center; gap:6px; background:${L}; border:${R}; padding:6px 14px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">
                    <select
                        class="trip-privacy-select"
                        data-trip-id="${h(u.id)}"
                        aria-label="${h(f(`archivedDetail.visibilityAria`))}"
                        style="background:transparent; border:0; color:${F}; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; padding: 2px 18px 2px 4px; appearance:none; -webkit-appearance:none; cursor:pointer; outline:none; background-image: url('data:image/svg+xml;utf8,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;10&quot; height=&quot;10&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;white&quot; stroke-width=&quot;3&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><polyline points=&quot;6 9 12 15 18 9&quot;/></svg>'); background-repeat:no-repeat; background-position: right 4px center; background-size: 8px;">
                        <option value="private" ${u.isPublic?``:`selected`} class="text-brand-navy">${h(f(`archivedDetail.visibilityPrivate`))}</option>
                        <option value="public-plan" ${u.isPublic&&!u.publicShowExpenses?`selected`:``} class="text-brand-navy">${h(f(`archivedDetail.visibilityPublicPlan`))}</option>
                        <option value="public-full" ${u.isPublic&&u.publicShowExpenses?`selected`:``} class="text-brand-navy">${h(f(`archivedDetail.visibilityPublicAll`))}</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- Day grid. Each card is keyboard-accessible (role=button)
             and opens the read-only openDayView modal on click. -->
        <div style="display:flex; align-items:baseline; gap:12px; margin: 8px 4px 14px;">
            <h2 class="ad-hero-title">${h(f(`archivedDetail.journeyTitle`))}</h2>
            <span class="ad-text-muted-sm">${h(f(`archivedDetail.journeySubtitle`))}</span>
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:18px;">
            ${D.sort((e,t)=>e.dayNumber-t.dayNumber).map(e=>{let t=e.photos||[],n=k.filter(t=>t.dayId===e.id),i=t.length+n.length,a=e.tickets||[],o=A.filter(t=>t.dayId===e.id),s=a.length+o.length,c=Number(e.dayNumber)===0,l=t[0]||n[0]?.src||null,u=!!l,d=e.name?f(`archivedDetail.dayAriaWithName`,{n:e.dayNumber,name:e.name}):f(`archivedDetail.dayAria`,{n:e.dayNumber}),p=c?f(`archivedDetail.dayBadgeHub`):f(`tripMedia.dayBucketDay`,{n:e.dayNumber}),m=c?f(`archivedDetail.dayTitleHub`):f(`tripMedia.dayBucketDay`,{n:e.dayNumber});return`
                    <div class="archived-day-block" data-day-id="${h(e.id)}" role="button" tabindex="0" aria-label="${h(d)}"
                        style="position:relative; cursor:pointer; min-height:170px; border-radius:24px; padding:20px; display:flex; flex-direction:column; justify-content:space-between; transition: transform 0.35s cubic-bezier(0.16,1,0.3,1), box-shadow 0.35s cubic-bezier(0.16,1,0.3,1); ${u?`background: linear-gradient(180deg, rgba(0,45,91,0.15) 0%, rgba(0,45,91,0.78) 100%), url(${h(l)}) center/cover no-repeat; border: 1px solid rgba(0,0,0,0.08); color: white;`:`background: white; border: 1.5px solid rgba(0,113,227,0.18); color: #002d5b;`} box-shadow: 0 10px 30px rgba(0,0,0,0.06);">
                        <!-- Top: badge -->
                        <div class="flex items-center gap-2">
                            <span style="background: ${c?`rgba(52,199,89,0.95)`:`rgba(0,113,227,0.95)`}; color:white; padding: 4px 12px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.1em;">${h(p)}</span>
                        </div>
                        <!-- Bottom: name + count chips -->
                        <div>
                            <h3 style="margin:0; font-size:1.4rem; font-weight:800; letter-spacing:-0.02em; color:${u?`#ffffff`:`#002d5b`}; line-height:1.15; ${u?`text-shadow: 0 2px 12px rgba(0,0,0,0.4);`:``}">${h(e.name||m)}</h3>
                            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
                                ${i>0?`<span style="display:inline-flex; align-items:center; gap:4px; background:${u?`rgba(255,255,255,0.18)`:`rgba(0,113,227,0.08)`}; color:${u?`#ffffff`:`var(--accent-blue)`}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">${r(`photo`,{size:12})}${i}</span>`:``}
                                ${s>0?`<span style="display:inline-flex; align-items:center; gap:4px; background:${u?`rgba(255,255,255,0.18)`:`rgba(88,86,214,0.08)`}; color:${u?`#ffffff`:`#5856d6`}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">${r(`document`,{size:12})}${s}</span>`:``}
                                ${e.notes?`<span style="background:${u?`rgba(255,255,255,0.18)`:`rgba(255,149,0,0.08)`}; color:${u?`#ffffff`:`#ff9500`}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">${h(f(`archivedDetail.notesChip`))}</span>`:``}
                            </div>
                        </div>
                    </div>
                `}).join(``)}
        </div>

        ${(()=>{let e=e=>{if(!e)return null;let t=D.find(t=>t.id===e);return t?Number(t.dayNumber)===0?f(`archivedDetail.dayBadgeHub`):f(`tripMedia.dayBucketDay`,{n:t.dayNumber}):null},t=e=>{if(!e)return!1;let t=D.find(t=>t.id===e);return!!t&&Number(t.dayNumber)===0},n=n=>{if(t(n))return`<span style="background:rgba(52,199,89,0.12); color:#1a6b3c; padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${h(f(`archivedDetail.dayBadgeHub`))}</span>`;let r=e(n);return r?`<span style="background:rgba(0,113,227,0.08); color:var(--accent-blue); padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${h(r)}</span>`:`<span style="background:rgba(0,0,0,0.05); color:rgba(0,0,0,0.45); padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${h(f(`archivedDetail.dayBucketUnsorted`))}</span>`},i=[],a=f(`tripMedia.docsFallbackName`);A.forEach(e=>i.push({name:e.name||a,url:e.url||``,dayId:e.dayId||null,source:`trip`,_key:e.id||`${e.name}-${e.url}`})),D.forEach(e=>{(e.tickets||[]).forEach((t,n)=>i.push({name:t.name||a,url:t.url||``,dayId:e.id,source:`day`,_key:`${e.id}#${n}`}))});let o=e=>{if(!e)return-1;let t=D.find(t=>t.id===e);return t?t.dayNumber:999};i.sort((e,t)=>o(e.dayId)-o(t.dayId));let s=[];k.forEach(e=>s.push({src:e.src||``,dayId:e.dayId||null,source:`trip`,_key:e.id||e.src})),D.forEach(e=>{(e.photos||[]).forEach((t,n)=>s.push({src:t,dayId:e.id,source:`day`,_key:`${e.id}#${n}`}))}),s.sort((e,t)=>o(e.dayId)-o(t.dayId));let c=e=>/^data:image\//i.test(e||``)||/\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|tiff?|svg)(\?.*)?$/i.test(e||``);return(i.length===0?``:`
                <div class="ad-section-header-row">
                    <h2 class="ad-hero-title">${h(f(`archivedDetail.docsTitle`))}</h2>
                    <span class="ad-text-muted-sm">${h(f(`archivedDetail.docsSubtitle`,{count:i.length}))}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:8px;">
                    ${i.map(e=>`
                        <a href="${h(e.url||`#`)}" target="_blank" rel="noreferrer" style="display:flex; align-items:center; gap:12px; background:white; border:1px solid rgba(0,0,0,0.07); border-radius:14px; padding:12px 14px; box-shadow: 0 2px 8px rgba(0,45,91,0.04); text-decoration:none; color:#002d5b;">
                            <span style="line-height:1; flex-shrink:0; display:inline-flex; color:#5856d6;">${r(`document`,{size:20})}</span>
                            <div style="flex:1; min-width:0;">
                                <div class="flex items-center gap-2">
                                    <span style="font-weight:800; font-size:0.92rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${h(e.name)}</span>
                                    ${n(e.dayId)}
                                </div>
                                ${e.url?`<div style="font-size:0.7rem; color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${h(e.url)}</div>`:``}
                            </div>
                            <span style="color: var(--accent-blue); font-size:0.78rem; font-weight:700; flex-shrink:0;">${h(f(`archivedDetail.docOpenAction`))}</span>
                        </a>
                    `).join(``)}
                </div>
            `)+(s.length===0?``:`
                <div class="ad-section-header-row">
                    <h2 class="ad-hero-title">${h(f(`archivedDetail.allPhotosTitle`))}</h2>
                    <span class="ad-text-muted-sm">${h(f(`archivedDetail.allPhotosSubtitle`,{count:s.length}))}</span>
                </div>
                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:10px; margin-bottom:24px;">
                    ${s.map(n=>{let r=e(n.dayId),i=t(n.dayId)?`rgba(52,199,89,0.85)`:`rgba(0,0,0,0.55)`,a=r?`<div style="position:absolute; top:6px; left:6px; background: ${i}; color:white; padding:2px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; backdrop-filter: blur(6px);">${h(r)}</div>`:`<div style="position:absolute; top:6px; left:6px; background: rgba(0,0,0,0.45); color:white; padding:2px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; backdrop-filter: blur(6px);">${h(f(`archivedDetail.dayBucketUnsorted`))}</div>`;return c(n.src)?`<a href="${h(n.src)}" target="_blank" rel="noreferrer" style="position:relative; aspect-ratio:1; border-radius:14px; overflow:hidden; background-image:url(${h(n.src)}); background-size:cover; background-position:center; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border:1px solid rgba(0,0,0,0.06); display:block;">${a}</a>`:`<a href="${h(n.src)}" target="_blank" rel="noreferrer" style="position:relative; aspect-ratio:1; border-radius:14px; overflow:hidden; background: var(--gradient-day); box-shadow: 0 4px 12px rgba(0,113,227,0.18); border:1px solid rgba(0,0,0,0.06); display:flex; flex-direction:column; align-items:center; justify-content:center; padding:14px; text-align:center; color:white; text-decoration:none;">${a}<div style="font-size:1.8rem; line-height:1; margin-bottom:8px;">🔗</div><div style="font-size:0.7rem; font-weight:800; opacity:0.9; word-break:break-all; overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;">${h(n.src.replace(/^https?:\/\//,``))}</div></a>`}).join(``)}
                </div>
            `)})()}
    `,g.querySelector(`#backToCollectionsBtn`)?.addEventListener(`click`,()=>y(`collections`));let B=g.querySelector(`#shareTripBtn`);return B&&n(u.id).then(e=>{e?.shared&&(B.dataset.shared=`1`,B.dataset.postId=String(e.post_id),o(B,!0))}),g.addEventListener(`click`,async e=>{let t=e.target,n=t?.closest(`.restore-trip-btn`);if(n?.dataset.tripId){E(n.dataset.tripId);return}let r=t?.closest(`#cloneTripBtn`);if(r?.dataset.tripId){r.setAttribute(`disabled`,`true`);let e=r.innerHTML;r.innerHTML=h(f(`archivedDetail.cloneStatusCloning`));try{let t=await p(r.dataset.tripId);if(!t?.ok||!t.body?.tripId){c(f(`archivedDetail.cloneError`)),r.removeAttribute(`disabled`),r.innerHTML=e;return}let n=t.body.tripId;v.activeTripId=n,await _(),v.activeTripId=n,S(`state:changed`),c(f(`archivedDetail.cloneSuccess`)),y(`home`)}catch(t){console.error(`Clone failed:`,t),c(f(`archivedDetail.cloneError`)),r.removeAttribute(`disabled`),r.innerHTML=e}return}let g=t?.closest(`#shareTripBtn`);if(g){x({trip:u,onShareToFeed:()=>{if(g.dataset.shared===`1`){let e=Number(g.dataset.postId||0);if(!e)return;l({title:f(`archivedDetail.unshareConfirmTitle`),message:f(`archivedDetail.unshareConfirmBody`),confirmText:f(`archivedDetail.unshareConfirmBtn`),onConfirm:async()=>{let t=await b(e);if(!t||!t.ok){c(f(`archivedDetail.unshareError`));return}g.dataset.shared=`0`,g.dataset.postId=``,o(g,!1),c(f(`archivedDetail.unshareSuccess`))}});return}m(u,async e=>{let t=await s(u.id,e);if(!t||!t.ok){let e=t?.status??`no-response`,n=t?.body?.error||``;c(`Share failed — HTTP ${e}`+(n?` · ${n}`:``)),console.error(`[collections.share] failed`,{tripId:u.id,status:e,body:t?.body});return}let n=Number(t.body?.post_id)||0;n&&(g.dataset.shared=`1`,g.dataset.postId=String(n),o(g,!0)),t.body?.status===`already_shared`?c(f(e?`archivedDetail.shareUpdated`:`archivedDetail.shareAlready`)):c(f(`archivedDetail.shareSuccess`))})}});return}let C=t?.closest(`a[href]`);if(C&&a(C.href)){let t=e;if(!t.metaKey&&!t.ctrlKey&&!t.shiftKey&&t.button!==1){t.preventDefault();let e=C.querySelector(`span`)?.textContent?.trim()||`Document`;d(C.href,e);return}}let w=t?.closest(`.archived-day-block`);if(w?.dataset.dayId){let e=(u.tripDays||[]).find(e=>e.id===w.dataset.dayId);e&&i(e);return}}),g.addEventListener(`change`,e=>{let t=e.target?.closest(`.trip-privacy-select`);t?.dataset.tripId&&T(t.dataset.tripId,t.value)}),g}var k=async e=>{let t=document.getElementById(`app-container`);if(!t)return;let n=v.archivedTrips.find(t=>t.id===e)||v.trips.find(t=>t.id===e);if(n){await g(e),t.innerHTML=``,t.appendChild(O(n));return}t.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary); font-size:0.95rem;">${f(`collections.loadingTrip`)}</div>`;try{let n=await w(`/api/public-trip/${encodeURIComponent(e)}`);if(!n.ok){t.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">${f(`collections.tripUnavailable`)}</div>`;return}let r=await n.json();if(!r?.trip){t.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">${f(`collections.tripNotFound`)}</div>`;return}t.innerHTML=``,t.appendChild(O(r.trip))}catch(e){console.error(`viewArchivedDetails fetch failed:`,e),t.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">${f(`collections.loadFailed`)}</div>`}};export{T as i,D as n,E as r,k as t};
//# sourceMappingURL=collections-BtjdG5ky.js.map