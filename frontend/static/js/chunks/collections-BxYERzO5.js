import{At as e,C as t,Dt as n,E as r,Gt as i,H as a,Ht as o,K as s,N as c,Ot as l,T as u,Tt as d,U as f,X as p,Xt as m,cn as h,it as g,kt as _,lt as v,o as y,sn as b,tn as x,tt as S,ut as C,zt as w}from"../app.bundle.js";var T=async(e,t)=>{let n=b.archivedTrips.find(t=>t.id===e)||b.trips.find(t=>t.id===e);if(n&&(n.isPublic=t!==`private`,n.publicShowExpenses=t===`public-full`,h(`state:changed`),b.user))try{await v(n)}catch{}},E=e=>{let n=b.archivedTrips.find(t=>t.id===e);n&&w({title:t(`errors.restoreTripTitle`),message:t(`errors.restoreTripBody`),confirmText:t(`errors.restoreTripConfirmBtn`),onConfirm:async()=>{n.isArchived=!1,n.expenses&&(b.expenses=[...b.expenses,...n.expenses],delete n.expenses),n.tripDays&&(b.tripDays=[...b.tripDays,...n.tripDays],delete n.tripDays);let t=n.settlements;t&&t.length>0&&(b.settlements=[...b.settlements||[],...t],delete n.settlements),b.trips.push(n),b.archivedTrips=b.archivedTrips.filter(t=>t.id!==e),b.activeTripId=e,h(`state:changed`);try{await S(e)}catch{}C(`home`)}})},D=e=>{w({title:t(`errors.deleteTripTitle`),message:t(`errors.deleteTripBody`),confirmText:t(`errors.deleteTripConfirmBtn`),onConfirm:async()=>{b.archivedTrips=b.archivedTrips.filter(t=>t.id!==e),h(`state:changed`);try{await c(e)}catch(e){console.error(`Delete archived trip failed:`,e)}C(`collections`)}})};function O(c){let u=typeof c==`string`?b.archivedTrips.find(e=>e.id===c)||b.trips.find(e=>e.id===c):c,f=document.createElement(`div`);if(!u)return f.innerHTML=`<p style="padding: 40px; text-align: center;">${i(t(`archivedDetail.notFound`))}</p>`,f;let v=(u.expenses||[]).filter(e=>!e.isSettlement),S=v.reduce((e,t)=>e+(t.euroValue||0),0),D=u.tripDays||[],O=D.filter(e=>(e.dayNumber||0)>0).length,k=Array.isArray(u.photos)?u.photos:[],A=Array.isArray(u.documents)?u.documents:[],j=D.reduce((e,t)=>e+(t.photos||[]).length,0)+k.length,M=D.reduce((e,t)=>e+(t.tickets||[]).length,0)+A.length,N=null;if(u.coverUrl&&(N=u.coverUrl),!N&&k.length>0&&(N=k[0].src),!N){for(let e of D)if(e.photos&&e.photos.length>0){N=e.photos[0];break}}let P=N?`background: linear-gradient(135deg, rgba(0,45,91,0.55), rgba(88,86,214,0.45)), url(${i(N)}) center/cover no-repeat;`:`background: linear-gradient(135deg, #007aff 0%, #5856d6 60%, #34c759 130%);`,F=`#ffffff`,I=`rgba(255,255,255,0.85)`,L=`rgba(255,255,255,0.16)`,R=`1px solid rgba(255,255,255,0.25)`,z=(e,t,n)=>`
        <div style="display:flex; align-items:center; gap:10px; background:${L}; border:${R}; padding:10px 16px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">
            <span style="font-size:1.05rem; line-height:1;">${e}</span>
            <div style="display:flex; flex-direction:column; line-height:1.05;">
                <span style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:${I};">${i(t)}</span>
                <span style="font-size:0.95rem; font-weight:800; color:${F};">${i(n)}</span>
            </div>
        </div>
    `;f.innerHTML=`
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
                <button id="backToCollectionsBtn" type="button" class="ad-pill-glass" style="background:rgba(255,255,255,0.16);">${i(t(`archivedDetail.backBtn`))}</button>
                <!-- Share button — now ALWAYS visible (no isPublic
                     gate). Opens the Share Chooser which lets the
                     user pick between "Share to feed" (in-app post,
                     still requires the trip be public) and "Get
                     share link" (public URL, no precondition). The
                     button's existence at minimum advertises that
                     completed trips ARE shareable, even if the
                     feed-share path needs the public toggle flipped
                     first. -->
                <button id="shareTripBtn" type="button" data-trip-id="${i(u.id)}" title="${i(t(`archivedDetail.shareBtnTitle`))}" aria-label="${i(t(`archivedDetail.shareBtnTitle`))}"
                    class="ad-pill-glass">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="18" cy="5" r="3"></circle>
                        <circle cx="6" cy="12" r="3"></circle>
                        <circle cx="18" cy="19" r="3"></circle>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                    </svg>
                    ${i(t(`archivedDetail.shareBtn`))}
                </button>
                <!-- §4.6 — Clone button. Available on every
                     archived trip detail (own AND fetched-via-public
                     trips). Drops a fresh draft into the user's
                     active trips with the same Path + ideas; their
                     expenses / photos / companions are NOT carried
                     over (clone is a template, not a copy). -->
                <button id="cloneTripBtn" type="button" data-trip-id="${i(u.id)}" title="${i(t(`archivedDetail.cloneBtnTitle`))}" aria-label="${i(t(`archivedDetail.cloneBtnAria`))}"
                    class="ad-pill-glass">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    ${i(t(`archivedDetail.cloneBtn`))}
                </button>
                <button class="restore-trip-btn" data-trip-id="${i(u.id)}" type="button" style="background:#ffffff; color:#002d5b; padding:10px 18px; border-radius:999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,0.18); border: 0;">${i(t(`archivedDetail.restoreBtn`))}</button>
            </div>

            <!-- Top tag chip + title block. -->
            <div style="position:relative; z-index:1; max-width: calc(100% - 260px);">
                <div style="display:inline-flex; align-items:center; gap:8px; background:${L}; border:${R}; padding:6px 14px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); margin-bottom:18px;">
                    <span style="font-size:0.85rem; line-height:1;">📚</span>
                    <span style="font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.18em; color:${F};">${i(t(`archivedDetail.heroTag`))}</span>
                </div>
                <h1 style="font-size: 3.2rem; margin: 0; letter-spacing: -0.04em; color: ${F}; font-weight: 800; line-height: 1; text-shadow: 0 2px 24px rgba(0,0,0,0.2);">${i(u.name)}</h1>
                ${u.country?`<div style="margin-top:10px; font-size:1rem; color:${I}; font-weight:600; display:flex; align-items:center; gap:8px;">${o(`pin`,{size:16})}${i(u.country)}</div>`:``}
            </div>

            <!-- Stat chip row. -->
            <div style="position:relative; z-index:1; display:flex; flex-wrap:wrap; gap:10px; margin-top:24px;">
                ${z(o(`calendar`,{size:17}),t(`archivedDetail.statDays`),String(O))}
                ${j>0?z(o(`photo`,{size:17}),t(`archivedDetail.statPhotos`),String(j)):``}
                ${M>0?z(o(`document`,{size:17}),t(`archivedDetail.statDocuments`),String(M)):``}
                ${v.length>0?z(o(`wallet`,{size:17}),t(`archivedDetail.statSpent`),x(S,`EUR`)):``}

                <!-- Public-trip granularity select, styled as a chip.
                     Replaces the legacy binary toggle. Three states:
                     private / public — plan only / public — incl.
                     expenses. Members ALWAYS see expenses regardless
                     of this flag (server-side gate). -->
                <div style="display:flex; align-items:center; gap:6px; background:${L}; border:${R}; padding:6px 14px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">
                    <select
                        class="trip-privacy-select"
                        data-trip-id="${i(u.id)}"
                        aria-label="${i(t(`archivedDetail.visibilityAria`))}"
                        style="background:transparent; border:0; color:${F}; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; padding: 2px 18px 2px 4px; appearance:none; -webkit-appearance:none; cursor:pointer; outline:none; background-image: url('data:image/svg+xml;utf8,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;10&quot; height=&quot;10&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;white&quot; stroke-width=&quot;3&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><polyline points=&quot;6 9 12 15 18 9&quot;/></svg>'); background-repeat:no-repeat; background-position: right 4px center; background-size: 8px;">
                        <option value="private" ${u.isPublic?``:`selected`} class="text-brand-navy">${i(t(`archivedDetail.visibilityPrivate`))}</option>
                        <option value="public-plan" ${u.isPublic&&!u.publicShowExpenses?`selected`:``} class="text-brand-navy">${i(t(`archivedDetail.visibilityPublicPlan`))}</option>
                        <option value="public-full" ${u.isPublic&&u.publicShowExpenses?`selected`:``} class="text-brand-navy">${i(t(`archivedDetail.visibilityPublicAll`))}</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- Day grid. Each card is keyboard-accessible (role=button)
             and opens the read-only openDayView modal on click. -->
        <div style="display:flex; align-items:baseline; gap:12px; margin: 8px 4px 14px;">
            <h2 class="ad-hero-title">${i(t(`archivedDetail.journeyTitle`))}</h2>
            <span class="ad-text-muted-sm">${i(t(`archivedDetail.journeySubtitle`))}</span>
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:18px;">
            ${D.sort((e,t)=>e.dayNumber-t.dayNumber).map(e=>{let n=e.photos||[],r=k.filter(t=>t.dayId===e.id),a=n.length+r.length,s=e.tickets||[],c=A.filter(t=>t.dayId===e.id),l=s.length+c.length,u=Number(e.dayNumber)===0,d=n[0]||r[0]?.src||null,f=!!d,p=e.name?t(`archivedDetail.dayAriaWithName`,{n:e.dayNumber,name:e.name}):t(`archivedDetail.dayAria`,{n:e.dayNumber}),m=u?t(`archivedDetail.dayBadgeHub`):t(`tripMedia.dayBucketDay`,{n:e.dayNumber}),h=u?t(`archivedDetail.dayTitleHub`):t(`tripMedia.dayBucketDay`,{n:e.dayNumber});return`
                    <div class="archived-day-block" data-day-id="${i(e.id)}" role="button" tabindex="0" aria-label="${i(p)}"
                        style="position:relative; cursor:pointer; min-height:170px; border-radius:24px; padding:20px; display:flex; flex-direction:column; justify-content:space-between; transition: transform 0.35s cubic-bezier(0.16,1,0.3,1), box-shadow 0.35s cubic-bezier(0.16,1,0.3,1); ${f?`background: linear-gradient(180deg, rgba(0,45,91,0.15) 0%, rgba(0,45,91,0.78) 100%), url(${i(d)}) center/cover no-repeat; border: 1px solid rgba(0,0,0,0.08); color: white;`:`background: white; border: 1.5px solid rgba(0,113,227,0.18); color: #002d5b;`} box-shadow: 0 10px 30px rgba(0,0,0,0.06);">
                        <!-- Top: badge -->
                        <div class="flex items-center gap-2">
                            <span style="background: ${u?`rgba(52,199,89,0.95)`:`rgba(0,113,227,0.95)`}; color:white; padding: 4px 12px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.1em;">${i(m)}</span>
                        </div>
                        <!-- Bottom: name + count chips -->
                        <div>
                            <h3 style="margin:0; font-size:1.4rem; font-weight:800; letter-spacing:-0.02em; color:${f?`#ffffff`:`#002d5b`}; line-height:1.15; ${f?`text-shadow: 0 2px 12px rgba(0,0,0,0.4);`:``}">${i(e.name||h)}</h3>
                            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
                                ${a>0?`<span style="display:inline-flex; align-items:center; gap:4px; background:${f?`rgba(255,255,255,0.18)`:`rgba(0,113,227,0.08)`}; color:${f?`#ffffff`:`var(--accent-blue)`}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">${o(`photo`,{size:12})}${a}</span>`:``}
                                ${l>0?`<span style="display:inline-flex; align-items:center; gap:4px; background:${f?`rgba(255,255,255,0.18)`:`rgba(88,86,214,0.08)`}; color:${f?`#ffffff`:`#5856d6`}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">${o(`document`,{size:12})}${l}</span>`:``}
                                ${e.notes?`<span style="background:${f?`rgba(255,255,255,0.18)`:`rgba(255,149,0,0.08)`}; color:${f?`#ffffff`:`#ff9500`}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">${i(t(`archivedDetail.notesChip`))}</span>`:``}
                            </div>
                        </div>
                    </div>
                `}).join(``)}
        </div>

        ${(()=>{let e=e=>{if(!e)return null;let n=D.find(t=>t.id===e);return n?Number(n.dayNumber)===0?t(`archivedDetail.dayBadgeHub`):t(`tripMedia.dayBucketDay`,{n:n.dayNumber}):null},n=e=>{if(!e)return!1;let t=D.find(t=>t.id===e);return!!t&&Number(t.dayNumber)===0},r=r=>{if(n(r))return`<span style="background:rgba(52,199,89,0.12); color:#1a6b3c; padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${i(t(`archivedDetail.dayBadgeHub`))}</span>`;let a=e(r);return a?`<span style="background:rgba(0,113,227,0.08); color:var(--accent-blue); padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${i(a)}</span>`:`<span style="background:rgba(0,0,0,0.05); color:rgba(0,0,0,0.45); padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${i(t(`archivedDetail.dayBucketUnsorted`))}</span>`},a=[],s=t(`tripMedia.docsFallbackName`);A.forEach(e=>a.push({name:e.name||s,url:e.url||``,dayId:e.dayId||null,source:`trip`,_key:e.id||`${e.name}-${e.url}`})),D.forEach(e=>{(e.tickets||[]).forEach((t,n)=>a.push({name:t.name||s,url:t.url||``,dayId:e.id,source:`day`,_key:`${e.id}#${n}`}))});let c=e=>{if(!e)return-1;let t=D.find(t=>t.id===e);return t?t.dayNumber:999};a.sort((e,t)=>c(e.dayId)-c(t.dayId));let l=[];k.forEach(e=>l.push({src:e.src||``,dayId:e.dayId||null,source:`trip`,_key:e.id||e.src})),D.forEach(e=>{(e.photos||[]).forEach((t,n)=>l.push({src:t,dayId:e.id,source:`day`,_key:`${e.id}#${n}`}))}),l.sort((e,t)=>c(e.dayId)-c(t.dayId));let u=e=>/^data:image\//i.test(e||``)||/\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|tiff?|svg)(\?.*)?$/i.test(e||``);return(a.length===0?``:`
                <div class="ad-section-header-row">
                    <h2 class="ad-hero-title">${i(t(`archivedDetail.docsTitle`))}</h2>
                    <span class="ad-text-muted-sm">${i(t(`archivedDetail.docsSubtitle`,{count:a.length}))}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:8px;">
                    ${a.map(e=>`
                        <a href="${i(e.url||`#`)}" target="_blank" rel="noreferrer" style="display:flex; align-items:center; gap:12px; background:white; border:1px solid rgba(0,0,0,0.07); border-radius:14px; padding:12px 14px; box-shadow: 0 2px 8px rgba(0,45,91,0.04); text-decoration:none; color:#002d5b;">
                            <span style="line-height:1; flex-shrink:0; display:inline-flex; color:#5856d6;">${o(`document`,{size:20})}</span>
                            <div style="flex:1; min-width:0;">
                                <div class="flex items-center gap-2">
                                    <span style="font-weight:800; font-size:0.92rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${i(e.name)}</span>
                                    ${r(e.dayId)}
                                </div>
                                ${e.url?`<div style="font-size:0.7rem; color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${i(e.url)}</div>`:``}
                            </div>
                            <span style="color: var(--accent-blue); font-size:0.78rem; font-weight:700; flex-shrink:0;">${i(t(`archivedDetail.docOpenAction`))}</span>
                        </a>
                    `).join(``)}
                </div>
            `)+(l.length===0?``:`
                <div class="ad-section-header-row">
                    <h2 class="ad-hero-title">${i(t(`archivedDetail.allPhotosTitle`))}</h2>
                    <span class="ad-text-muted-sm">${i(t(`archivedDetail.allPhotosSubtitle`,{count:l.length}))}</span>
                </div>
                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:10px; margin-bottom:24px;">
                    ${l.map(r=>{let a=e(r.dayId),o=n(r.dayId)?`rgba(52,199,89,0.85)`:`rgba(0,0,0,0.55)`,s=a?`<div style="position:absolute; top:6px; left:6px; background: ${o}; color:white; padding:2px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; backdrop-filter: blur(6px);">${i(a)}</div>`:`<div style="position:absolute; top:6px; left:6px; background: rgba(0,0,0,0.45); color:white; padding:2px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; backdrop-filter: blur(6px);">${i(t(`archivedDetail.dayBucketUnsorted`))}</div>`;return u(r.src)?`<a href="${i(r.src)}" target="_blank" rel="noreferrer" style="position:relative; aspect-ratio:1; border-radius:14px; overflow:hidden; background-image:url(${i(r.src)}); background-size:cover; background-position:center; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border:1px solid rgba(0,0,0,0.06); display:block;">${s}</a>`:`<a href="${i(r.src)}" target="_blank" rel="noreferrer" style="position:relative; aspect-ratio:1; border-radius:14px; overflow:hidden; background: var(--gradient-day); box-shadow: 0 4px 12px rgba(0,113,227,0.18); border:1px solid rgba(0,0,0,0.06); display:flex; flex-direction:column; align-items:center; justify-content:center; padding:14px; text-align:center; color:white; text-decoration:none;">${s}<div style="font-size:1.8rem; line-height:1; margin-bottom:8px;">🔗</div><div style="font-size:0.7rem; font-weight:800; opacity:0.9; word-break:break-all; overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;">${i(r.src.replace(/^https?:\/\//,``))}</div></a>`}).join(``)}
                </div>
            `)})()}
    `,f.querySelector(`#backToCollectionsBtn`)?.addEventListener(`click`,()=>C(`collections`));let B=f.querySelector(`#shareTripBtn`);return B&&a(u.id).then(e=>{e?.shared&&(B.dataset.shared=`1`,B.dataset.postId=String(e.post_id),l(B,!0))}),f.addEventListener(`click`,async a=>{let o=a.target,c=o?.closest(`.restore-trip-btn`);if(c?.dataset.tripId){E(c.dataset.tripId);return}let f=o?.closest(`#cloneTripBtn`);if(f?.dataset.tripId){f.setAttribute(`disabled`,`true`);let e=f.innerHTML;f.innerHTML=i(t(`archivedDetail.cloneStatusCloning`));try{let n=await r(f.dataset.tripId);if(!n?.ok||!n.body?.tripId){m(t(`archivedDetail.cloneError`)),f.removeAttribute(`disabled`),f.innerHTML=e;return}let i=n.body.tripId;b.activeTripId=i,await s(),b.activeTripId=i,h(`state:changed`),m(t(`archivedDetail.cloneSuccess`)),C(`home`)}catch(n){console.error(`Clone failed:`,n),m(t(`archivedDetail.cloneError`)),f.removeAttribute(`disabled`),f.innerHTML=e}return}let v=o?.closest(`#shareTripBtn`);if(v){y({trip:u,onShareToFeed:()=>{if(v.dataset.shared===`1`){let e=Number(v.dataset.postId||0);if(!e)return;w({title:t(`archivedDetail.unshareConfirmTitle`),message:t(`archivedDetail.unshareConfirmBody`),confirmText:t(`archivedDetail.unshareConfirmBtn`),onConfirm:async()=>{let n=await g(e);if(!n||!n.ok){m(t(`archivedDetail.unshareError`));return}v.dataset.shared=`0`,v.dataset.postId=``,l(v,!1),m(t(`archivedDetail.unshareSuccess`))}});return}n(u,async e=>{let n=await p(u.id,e);if(!n||!n.ok){let e=n?.status??`no-response`,t=n?.body?.error||``;m(`Share failed — HTTP ${e}`+(t?` · ${t}`:``)),console.error(`[collections.share] failed`,{tripId:u.id,status:e,body:n?.body});return}let r=Number(n.body?.post_id)||0;r&&(v.dataset.shared=`1`,v.dataset.postId=String(r),l(v,!0)),n.body?.status===`already_shared`?m(t(e?`archivedDetail.shareUpdated`:`archivedDetail.shareAlready`)):m(t(`archivedDetail.shareSuccess`))})}});return}let x=o?.closest(`a[href]`);if(x&&_(x.href)){let t=a;if(!t.metaKey&&!t.ctrlKey&&!t.shiftKey&&t.button!==1){t.preventDefault();let n=x.querySelector(`span`)?.textContent?.trim()||`Document`;e(x.href,n);return}}let S=o?.closest(`.archived-day-block`);if(S?.dataset.dayId){let e=(u.tripDays||[]).find(e=>e.id===S.dataset.dayId);e&&d(e);return}}),f.addEventListener(`change`,e=>{let t=e.target?.closest(`.trip-privacy-select`);t?.dataset.tripId&&T(t.dataset.tripId,t.value)}),f}var k=async e=>{let n=document.getElementById(`app-container`);if(!n)return;let r=b.archivedTrips.find(t=>t.id===e)||b.trips.find(t=>t.id===e);if(r){await f(e),n.innerHTML=``,n.appendChild(O(r));return}n.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary); font-size:0.95rem;">${t(`collections.loadingTrip`)}</div>`;try{let r=await u(`/api/public-trip/${encodeURIComponent(e)}`);if(!r.ok){n.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">${t(`collections.tripUnavailable`)}</div>`;return}let i=await r.json();if(!i?.trip){n.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">${t(`collections.tripNotFound`)}</div>`;return}n.innerHTML=``,n.appendChild(O(i.trip))}catch(e){console.error(`viewArchivedDetails fetch failed:`,e),n.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">${t(`collections.loadFailed`)}</div>`}};export{T as i,D as n,E as r,k as t};
//# sourceMappingURL=collections-BxYERzO5.js.map