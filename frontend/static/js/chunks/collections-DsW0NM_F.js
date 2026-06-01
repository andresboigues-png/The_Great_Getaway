import{C as e,Dt as t,E as n,Et as r,G as i,H as a,N as o,Ot as s,Rt as c,T as l,V as u,Vt as d,Wt as f,Y as p,Yt as m,ct as h,en as g,et as _,kt as v,lt as y,o as b,on as x,rt as S,sn as C,wt as w}from"../app.bundle.js";var T=async(e,t)=>{let n=x.archivedTrips.find(t=>t.id===e)||x.trips.find(t=>t.id===e);if(n&&(n.isPublic=t!==`private`,n.publicShowExpenses=t===`public-full`,C(`state:changed`),x.user))try{await h(n)}catch{}},E=t=>{let n=x.archivedTrips.find(e=>e.id===t);n&&c({title:e(`errors.restoreTripTitle`),message:e(`errors.restoreTripBody`),confirmText:e(`errors.restoreTripConfirmBtn`),onConfirm:async()=>{n.isArchived=!1,n.expenses&&(x.expenses=[...x.expenses,...n.expenses],delete n.expenses),n.tripDays&&(x.tripDays=[...x.tripDays,...n.tripDays],delete n.tripDays);let e=n.settlements;e&&e.length>0&&(x.settlements=[...x.settlements||[],...e],delete n.settlements),x.trips.push(n),x.archivedTrips=x.archivedTrips.filter(e=>e.id!==t),x.activeTripId=t,C(`state:changed`);try{await _(t)}catch{}y(`home`)}})},D=t=>{c({title:e(`errors.deleteTripTitle`),message:e(`errors.deleteTripBody`),confirmText:e(`errors.deleteTripConfirmBtn`),onConfirm:async()=>{x.archivedTrips=x.archivedTrips.filter(e=>e.id!==t),C(`state:changed`);try{await o(t)}catch(e){console.error(`Delete archived trip failed:`,e)}y(`collections`)}})};function O(a){let o=typeof a==`string`?x.archivedTrips.find(e=>e.id===a)||x.trips.find(e=>e.id===a):a,l=document.createElement(`div`);if(!o)return l.innerHTML=`<p style="padding: 40px; text-align: center;">${f(e(`archivedDetail.notFound`))}</p>`,l;let h=(o.expenses||[]).filter(e=>!e.isSettlement),_=h.reduce((e,t)=>e+(t.euroValue||0),0),D=o.tripDays||[],O=D.filter(e=>(e.dayNumber||0)>0).length,k=Array.isArray(o.photos)?o.photos:[],A=Array.isArray(o.documents)?o.documents:[],j=D.reduce((e,t)=>e+(t.photos||[]).length,0)+k.length,M=D.reduce((e,t)=>e+(t.tickets||[]).length,0)+A.length,N=null;if(o.coverUrl&&(N=o.coverUrl),!N&&k.length>0&&(N=k[0].src),!N){for(let e of D)if(e.photos&&e.photos.length>0){N=e.photos[0];break}}let P=N?`background: linear-gradient(135deg, rgba(0,45,91,0.55), rgba(88,86,214,0.45)), url(${f(N)}) center/cover no-repeat;`:`background: linear-gradient(135deg, #007aff 0%, #5856d6 60%, #34c759 130%);`,F=`#ffffff`,I=`rgba(255,255,255,0.85)`,L=`rgba(255,255,255,0.16)`,R=`1px solid rgba(255,255,255,0.25)`,z=(e,t,n)=>`
        <div style="display:flex; align-items:center; gap:10px; background:${L}; border:${R}; padding:10px 16px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">
            <span style="font-size:1.05rem; line-height:1;">${e}</span>
            <div style="display:flex; flex-direction:column; line-height:1.05;">
                <span style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:${I};">${f(t)}</span>
                <span style="font-size:0.95rem; font-weight:800; color:${F};">${f(n)}</span>
            </div>
        </div>
    `;l.innerHTML=`
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
                <button id="backToCollectionsBtn" type="button" class="ad-pill-glass" style="background:rgba(255,255,255,0.16);">${f(e(`archivedDetail.backBtn`))}</button>
                <!-- Share button — now ALWAYS visible (no isPublic
                     gate). Opens the Share Chooser which lets the
                     user pick between "Share to feed" (in-app post,
                     still requires the trip be public) and "Get
                     share link" (public URL, no precondition). The
                     button's existence at minimum advertises that
                     completed trips ARE shareable, even if the
                     feed-share path needs the public toggle flipped
                     first. -->
                <button id="shareTripBtn" type="button" data-trip-id="${f(o.id)}" title="${f(e(`archivedDetail.shareBtnTitle`))}" aria-label="${f(e(`archivedDetail.shareBtnTitle`))}"
                    class="ad-pill-glass">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="18" cy="5" r="3"></circle>
                        <circle cx="6" cy="12" r="3"></circle>
                        <circle cx="18" cy="19" r="3"></circle>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                    </svg>
                    ${f(e(`archivedDetail.shareBtn`))}
                </button>
                <!-- §4.6 — Clone button. Available on every
                     archived trip detail (own AND fetched-via-public
                     trips). Drops a fresh draft into the user's
                     active trips with the same Path + ideas; their
                     expenses / photos / companions are NOT carried
                     over (clone is a template, not a copy). -->
                <button id="cloneTripBtn" type="button" data-trip-id="${f(o.id)}" title="${f(e(`archivedDetail.cloneBtnTitle`))}" aria-label="${f(e(`archivedDetail.cloneBtnAria`))}"
                    class="ad-pill-glass">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    ${f(e(`archivedDetail.cloneBtn`))}
                </button>
                <button class="restore-trip-btn" data-trip-id="${f(o.id)}" type="button" style="background:#ffffff; color:#002d5b; padding:10px 18px; border-radius:999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,0.18); border: 0;">${f(e(`archivedDetail.restoreBtn`))}</button>
            </div>

            <!-- Top tag chip + title block. -->
            <div style="position:relative; z-index:1; max-width: calc(100% - 260px);">
                <div style="display:inline-flex; align-items:center; gap:8px; background:${L}; border:${R}; padding:6px 14px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); margin-bottom:18px;">
                    <span style="font-size:0.85rem; line-height:1;">📚</span>
                    <span style="font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.18em; color:${F};">${f(e(`archivedDetail.heroTag`))}</span>
                </div>
                <h1 style="font-size: 3.2rem; margin: 0; letter-spacing: -0.04em; color: ${F}; font-weight: 800; line-height: 1; text-shadow: 0 2px 24px rgba(0,0,0,0.2);">${f(o.name)}</h1>
                ${o.country?`<div style="margin-top:10px; font-size:1rem; color:${I}; font-weight:600; display:flex; align-items:center; gap:8px;">${d(`pin`,{size:16})}${f(o.country)}</div>`:``}
            </div>

            <!-- Stat chip row. -->
            <div style="position:relative; z-index:1; display:flex; flex-wrap:wrap; gap:10px; margin-top:24px;">
                ${z(d(`calendar`,{size:17}),e(`archivedDetail.statDays`),String(O))}
                ${j>0?z(d(`photo`,{size:17}),e(`archivedDetail.statPhotos`),String(j)):``}
                ${M>0?z(d(`document`,{size:17}),e(`archivedDetail.statDocuments`),String(M)):``}
                ${h.length>0?z(d(`wallet`,{size:17}),e(`archivedDetail.statSpent`),g(_,`EUR`)):``}

                <!-- Public-trip granularity select, styled as a chip.
                     Replaces the legacy binary toggle. Three states:
                     private / public — plan only / public — incl.
                     expenses. Members ALWAYS see expenses regardless
                     of this flag (server-side gate). -->
                <div style="display:flex; align-items:center; gap:6px; background:${L}; border:${R}; padding:6px 14px; border-radius:999px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);">
                    <select
                        class="trip-privacy-select"
                        data-trip-id="${f(o.id)}"
                        aria-label="${f(e(`archivedDetail.visibilityAria`))}"
                        style="background:transparent; border:0; color:${F}; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; padding: 2px 18px 2px 4px; appearance:none; -webkit-appearance:none; cursor:pointer; outline:none; background-image: url('data:image/svg+xml;utf8,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;10&quot; height=&quot;10&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;white&quot; stroke-width=&quot;3&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><polyline points=&quot;6 9 12 15 18 9&quot;/></svg>'); background-repeat:no-repeat; background-position: right 4px center; background-size: 8px;">
                        <option value="private" ${o.isPublic?``:`selected`} class="text-brand-navy">${f(e(`archivedDetail.visibilityPrivate`))}</option>
                        <option value="public-plan" ${o.isPublic&&!o.publicShowExpenses?`selected`:``} class="text-brand-navy">${f(e(`archivedDetail.visibilityPublicPlan`))}</option>
                        <option value="public-full" ${o.isPublic&&o.publicShowExpenses?`selected`:``} class="text-brand-navy">${f(e(`archivedDetail.visibilityPublicAll`))}</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- Day grid. Each card is keyboard-accessible (role=button)
             and opens the read-only openDayView modal on click. -->
        <div style="display:flex; align-items:baseline; gap:12px; margin: 8px 4px 14px;">
            <h2 class="ad-hero-title">${f(e(`archivedDetail.journeyTitle`))}</h2>
            <span class="ad-text-muted-sm">${f(e(`archivedDetail.journeySubtitle`))}</span>
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:18px;">
            ${D.sort((e,t)=>e.dayNumber-t.dayNumber).map(t=>{let n=t.photos||[],r=k.filter(e=>e.dayId===t.id),i=n.length+r.length,a=t.tickets||[],o=A.filter(e=>e.dayId===t.id),s=a.length+o.length,c=Number(t.dayNumber)===0,l=n[0]||r[0]?.src||null,u=!!l,p=t.name?e(`archivedDetail.dayAriaWithName`,{n:t.dayNumber,name:t.name}):e(`archivedDetail.dayAria`,{n:t.dayNumber}),m=c?e(`archivedDetail.dayBadgeHub`):e(`tripMedia.dayBucketDay`,{n:t.dayNumber}),h=c?e(`archivedDetail.dayTitleHub`):e(`tripMedia.dayBucketDay`,{n:t.dayNumber});return`
                    <div class="archived-day-block" data-day-id="${f(t.id)}" role="button" tabindex="0" aria-label="${f(p)}"
                        style="position:relative; cursor:pointer; min-height:170px; border-radius:24px; padding:20px; display:flex; flex-direction:column; justify-content:space-between; transition: transform 0.35s cubic-bezier(0.16,1,0.3,1), box-shadow 0.35s cubic-bezier(0.16,1,0.3,1); ${u?`background: linear-gradient(180deg, rgba(0,45,91,0.15) 0%, rgba(0,45,91,0.78) 100%), url(${f(l)}) center/cover no-repeat; border: 1px solid rgba(0,0,0,0.08); color: white;`:`background: white; border: 1.5px solid rgba(0,113,227,0.18); color: #002d5b;`} box-shadow: 0 10px 30px rgba(0,0,0,0.06);">
                        <!-- Top: badge -->
                        <div class="flex items-center gap-2">
                            <span style="background: ${c?`rgba(52,199,89,0.95)`:`rgba(0,113,227,0.95)`}; color:white; padding: 4px 12px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.1em;">${f(m)}</span>
                        </div>
                        <!-- Bottom: name + count chips -->
                        <div>
                            <h3 style="margin:0; font-size:1.4rem; font-weight:800; letter-spacing:-0.02em; color:${u?`#ffffff`:`#002d5b`}; line-height:1.15; ${u?`text-shadow: 0 2px 12px rgba(0,0,0,0.4);`:``}">${f(t.name||h)}</h3>
                            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
                                ${i>0?`<span style="display:inline-flex; align-items:center; gap:4px; background:${u?`rgba(255,255,255,0.18)`:`rgba(0,113,227,0.08)`}; color:${u?`#ffffff`:`var(--accent-blue)`}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">${d(`photo`,{size:12})}${i}</span>`:``}
                                ${s>0?`<span style="display:inline-flex; align-items:center; gap:4px; background:${u?`rgba(255,255,255,0.18)`:`rgba(88,86,214,0.08)`}; color:${u?`#ffffff`:`#5856d6`}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">${d(`document`,{size:12})}${s}</span>`:``}
                                ${t.notes?`<span style="background:${u?`rgba(255,255,255,0.18)`:`rgba(255,149,0,0.08)`}; color:${u?`#ffffff`:`#ff9500`}; padding:3px 10px; border-radius:999px; font-size:0.7rem; font-weight:700;">${f(e(`archivedDetail.notesChip`))}</span>`:``}
                            </div>
                        </div>
                    </div>
                `}).join(``)}
        </div>

        ${(()=>{let t=t=>{if(!t)return null;let n=D.find(e=>e.id===t);return n?Number(n.dayNumber)===0?e(`archivedDetail.dayBadgeHub`):e(`tripMedia.dayBucketDay`,{n:n.dayNumber}):null},n=e=>{if(!e)return!1;let t=D.find(t=>t.id===e);return!!t&&Number(t.dayNumber)===0},r=r=>{if(n(r))return`<span style="background:rgba(52,199,89,0.12); color:#1a6b3c; padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${f(e(`archivedDetail.dayBadgeHub`))}</span>`;let i=t(r);return i?`<span style="background:rgba(0,113,227,0.08); color:var(--accent-blue); padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${f(i)}</span>`:`<span style="background:rgba(0,0,0,0.05); color:rgba(0,0,0,0.45); padding:2px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${f(e(`archivedDetail.dayBucketUnsorted`))}</span>`},i=[],a=e(`tripMedia.docsFallbackName`);A.forEach(e=>i.push({name:e.name||a,url:e.url||``,dayId:e.dayId||null,source:`trip`,_key:e.id||`${e.name}-${e.url}`})),D.forEach(e=>{(e.tickets||[]).forEach((t,n)=>i.push({name:t.name||a,url:t.url||``,dayId:e.id,source:`day`,_key:`${e.id}#${n}`}))});let o=e=>{if(!e)return-1;let t=D.find(t=>t.id===e);return t?t.dayNumber:999};i.sort((e,t)=>o(e.dayId)-o(t.dayId));let s=[];k.forEach(e=>s.push({src:e.src||``,dayId:e.dayId||null,source:`trip`,_key:e.id||e.src})),D.forEach(e=>{(e.photos||[]).forEach((t,n)=>s.push({src:t,dayId:e.id,source:`day`,_key:`${e.id}#${n}`}))}),s.sort((e,t)=>o(e.dayId)-o(t.dayId));let c=e=>/^data:image\//i.test(e||``)||/\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|tiff?|svg)(\?.*)?$/i.test(e||``);return(i.length===0?``:`
                <div class="ad-section-header-row">
                    <h2 class="ad-hero-title">${f(e(`archivedDetail.docsTitle`))}</h2>
                    <span class="ad-text-muted-sm">${f(e(`archivedDetail.docsSubtitle`,{count:i.length}))}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:8px;">
                    ${i.map(t=>`
                        <a href="${f(t.url||`#`)}" target="_blank" rel="noreferrer" style="display:flex; align-items:center; gap:12px; background:white; border:1px solid rgba(0,0,0,0.07); border-radius:14px; padding:12px 14px; box-shadow: 0 2px 8px rgba(0,45,91,0.04); text-decoration:none; color:#002d5b;">
                            <span style="line-height:1; flex-shrink:0; display:inline-flex; color:#5856d6;">${d(`document`,{size:20})}</span>
                            <div style="flex:1; min-width:0;">
                                <div class="flex items-center gap-2">
                                    <span style="font-weight:800; font-size:0.92rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f(t.name)}</span>
                                    ${r(t.dayId)}
                                </div>
                                ${t.url?`<div style="font-size:0.7rem; color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f(t.url)}</div>`:``}
                            </div>
                            <span style="color: var(--accent-blue); font-size:0.78rem; font-weight:700; flex-shrink:0;">${f(e(`archivedDetail.docOpenAction`))}</span>
                        </a>
                    `).join(``)}
                </div>
            `)+(s.length===0?``:`
                <div class="ad-section-header-row">
                    <h2 class="ad-hero-title">${f(e(`archivedDetail.allPhotosTitle`))}</h2>
                    <span class="ad-text-muted-sm">${f(e(`archivedDetail.allPhotosSubtitle`,{count:s.length}))}</span>
                </div>
                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:10px; margin-bottom:24px;">
                    ${s.map(r=>{let i=t(r.dayId),a=n(r.dayId)?`rgba(52,199,89,0.85)`:`rgba(0,0,0,0.55)`,o=i?`<div style="position:absolute; top:6px; left:6px; background: ${a}; color:white; padding:2px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; backdrop-filter: blur(6px);">${f(i)}</div>`:`<div style="position:absolute; top:6px; left:6px; background: rgba(0,0,0,0.45); color:white; padding:2px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; backdrop-filter: blur(6px);">${f(e(`archivedDetail.dayBucketUnsorted`))}</div>`;return c(r.src)?`<a href="${f(r.src)}" target="_blank" rel="noreferrer" style="position:relative; aspect-ratio:1; border-radius:14px; overflow:hidden; background-image:url(${f(r.src)}); background-size:cover; background-position:center; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border:1px solid rgba(0,0,0,0.06); display:block;">${o}</a>`:`<a href="${f(r.src)}" target="_blank" rel="noreferrer" style="position:relative; aspect-ratio:1; border-radius:14px; overflow:hidden; background: var(--gradient-day); box-shadow: 0 4px 12px rgba(0,113,227,0.18); border:1px solid rgba(0,0,0,0.06); display:flex; flex-direction:column; align-items:center; justify-content:center; padding:14px; text-align:center; color:white; text-decoration:none;">${o}<div style="font-size:1.8rem; line-height:1; margin-bottom:8px;">🔗</div><div style="font-size:0.7rem; font-weight:800; opacity:0.9; word-break:break-all; overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;">${f(r.src.replace(/^https?:\/\//,``))}</div></a>`}).join(``)}
                </div>
            `)})()}
    `,l.querySelector(`#backToCollectionsBtn`)?.addEventListener(`click`,()=>y(`collections`));let B=l.querySelector(`#shareTripBtn`);return B&&u(o.id).then(e=>{e?.shared&&(B.dataset.shared=`1`,B.dataset.postId=String(e.post_id),t(B,!0))}),l.addEventListener(`click`,async a=>{let l=a.target,u=l?.closest(`.restore-trip-btn`);if(u?.dataset.tripId){E(u.dataset.tripId);return}let d=l?.closest(`#cloneTripBtn`);if(d?.dataset.tripId){d.setAttribute(`disabled`,`true`);let t=d.innerHTML;d.innerHTML=f(e(`archivedDetail.cloneStatusCloning`));try{let r=await n(d.dataset.tripId);if(!r?.ok||!r.body?.tripId){m(e(`archivedDetail.cloneError`)),d.removeAttribute(`disabled`),d.innerHTML=t;return}let a=r.body.tripId;x.activeTripId=a,await i(),x.activeTripId=a,C(`state:changed`),m(e(`archivedDetail.cloneSuccess`)),y(`home`)}catch(n){console.error(`Clone failed:`,n),m(e(`archivedDetail.cloneError`)),d.removeAttribute(`disabled`),d.innerHTML=t}return}let h=l?.closest(`#shareTripBtn`);if(h){b({trip:o,onShareToFeed:()=>{if(h.dataset.shared===`1`){let n=Number(h.dataset.postId||0);if(!n)return;c({title:e(`archivedDetail.unshareConfirmTitle`),message:e(`archivedDetail.unshareConfirmBody`),confirmText:e(`archivedDetail.unshareConfirmBtn`),onConfirm:async()=>{let r=await S(n);if(!r||!r.ok){m(e(`archivedDetail.unshareError`));return}h.dataset.shared=`0`,h.dataset.postId=``,t(h,!1),m(e(`archivedDetail.unshareSuccess`))}});return}r(o,async n=>{let r=await p(o.id,n);if(!r||!r.ok){let e=r?.status??`no-response`,t=r?.body?.error||``;m(`Share failed — HTTP ${e}`+(t?` · ${t}`:``)),console.error(`[collections.share] failed`,{tripId:o.id,status:e,body:r?.body});return}let i=Number(r.body?.post_id)||0;i&&(h.dataset.shared=`1`,h.dataset.postId=String(i),t(h,!0)),r.body?.status===`already_shared`?m(e(n?`archivedDetail.shareUpdated`:`archivedDetail.shareAlready`)):m(e(`archivedDetail.shareSuccess`))})}});return}let g=l?.closest(`a[href]`);if(g&&s(g.href)){let e=a;if(!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&e.button!==1){e.preventDefault();let t=g.querySelector(`span`)?.textContent?.trim()||`Document`;v(g.href,t);return}}let _=l?.closest(`.archived-day-block`);if(_?.dataset.dayId){let e=(o.tripDays||[]).find(e=>e.id===_.dataset.dayId);e&&w(e);return}}),l.addEventListener(`change`,e=>{let t=e.target?.closest(`.trip-privacy-select`);t?.dataset.tripId&&T(t.dataset.tripId,t.value)}),l}var k=async t=>{let n=document.getElementById(`app-container`);if(!n)return;let r=x.archivedTrips.find(e=>e.id===t)||x.trips.find(e=>e.id===t);if(r){await a(t),n.innerHTML=``,n.appendChild(O(r));return}n.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary); font-size:0.95rem;">${e(`collections.loadingTrip`)}</div>`;try{let r=await l(`/api/public-trip/${encodeURIComponent(t)}`);if(!r.ok){n.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">${e(`collections.tripUnavailable`)}</div>`;return}let i=await r.json();if(!i?.trip){n.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">${e(`collections.tripNotFound`)}</div>`;return}n.innerHTML=``,n.appendChild(O(i.trip))}catch(t){console.error(`viewArchivedDetails fetch failed:`,t),n.innerHTML=`<div style="padding:60px 20px; text-align:center; color:var(--text-secondary);">${e(`collections.loadFailed`)}</div>`}};export{T as i,D as n,E as r,k as t};
//# sourceMappingURL=collections-DsW0NM_F.js.map