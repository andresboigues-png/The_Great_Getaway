import{n as e}from"./rolldown-runtime-Kw0j5LDr.js";import{A as t,Dn as n,Nn as r,On as i,Sn as a,T as o,Tt as s,Xn as c,Yn as l,at as u,bn as d,n as f,w as p,wt as m,yt as h}from"../app.bundle.js";var g=e({openShareChooserModal:()=>y,openShareTripModal:()=>v,openTripInviteResponseModal:()=>_}),_=e=>{let r=e.related_id?String(e.related_id):``;if(!r)return;let o=!1,m=e.id,g=f(`trip_invite`,e.message),{root:_,close:v}=d({variant:`glass-light`,cardStyle:`width: 440px;`,onClose:()=>{o||m!=null&&h(m)},innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${a(p(`modals.inviteTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.6); line-height: 1.5;">
                ${a(g)}
            </p>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-sm); color: rgba(0,0,0,0.5);">
                ${a(p(`modals.inviteBody`))}
            </p>

            <div style="display: flex; gap: var(--space-3);">
                <button id="tripInviteAcceptBtn" class="btn-primary" style="flex: 2; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">${a(p(`modals.inviteAcceptBtn`))}</button>
                <button id="tripInviteDeclineBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">${a(p(`modals.inviteDeclineBtn`))}</button>
            </div>
        `});n(_,`#tripInviteAcceptBtn`).onclick=async()=>{o=!0;let e=await u(r,!0);if(!e||!e.ok){i(p(`modals.inviteErrorInvalid`)),v();return}v(),await t(),l.trips.find(e=>e.id===r)&&(l.activeTripId=r,c(`state:changed`)),i(p(`modals.inviteSuccessJoined`),`success`),s(`home`)},n(_,`#tripInviteDeclineBtn`).onclick=async()=>{o=!0;let e=await u(r,!1);!e||!e.ok?i(p(`modals.inviteErrorNotActive`)):i(p(`modals.inviteToastDeclined`),`info`),v()}},v=e=>{if(!e)return;let t=l.trips.find(t=>t.id===e.id)||l.archivedTrips.find(t=>t.id===e.id)||e,r=t.shareToken||null,s=!!t.shareShowCost,u=!!t.shareShowPlans,{root:f,close:h}=d({variant:`glass`,cardStyle:`width: 460px; position: relative;`,innerHTML:`
            ${`
        <button type="button" id="modalCloseX" aria-label="${a(p(`share.closeAriaLabel`))}"
            style="position:absolute; top:14px; right:14px; width:32px; height:32px; border-radius:50%; background:rgba(0,0,0,0.18); border:0; color:#ffffff; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `}
            <h2 class="card-title" style="font-size: var(--font-2xl); margin-bottom: var(--space-2); color: #ffffff; letter-spacing: -0.04em; font-weight: 800; text-align: center; padding-left: 32px; padding-right: 32px;">${a(p(`share.linkTitle`))}</h2>
            <p class="mdl-subtitle-hero">
                ${a(p(`share.linkSubtitle`))}
            </p>

            <!-- Privacy toggles. Default off unless the trip already
                 had them on from a previous share. The shared page
                 ALWAYS shows the trip's name, cover photo, and the
                 day-by-day Path; these toggles add layers on top. -->
            <label id="shareCostToggleRow" style="display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: var(--space-3) var(--space-4); background: rgba(255,255,255,0.08); border-radius: 14px; margin-bottom: 10px; cursor: pointer;">
                <input type="checkbox" id="shareCostToggle" ${s?`checked`:``} class="mdl-checkbox-accent">
                <div class="flex-1-truncate">
                    <div class="mdl-text-label-dark">${a(p(`share.toggleCostTitle`))}</div>
                    <div class="mdl-sub-text-fade">${a(p(`share.toggleCostBody`))}</div>
                </div>
            </label>
            <label id="sharePlansToggleRow" style="display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: var(--space-3) var(--space-4); background: rgba(255,255,255,0.08); border-radius: 14px; margin-bottom: var(--space-4); cursor: pointer;">
                <input type="checkbox" id="sharePlansToggle" ${u?`checked`:``} class="mdl-checkbox-accent">
                <div class="flex-1-truncate">
                    <div class="mdl-text-label-dark">${a(p(`share.togglePlansTitle`))}</div>
                    <div class="mdl-sub-text-fade">${a(p(`share.togglePlansBody`))}</div>
                </div>
            </label>

            <!-- Status / URL block — swapped based on whether a token
                 already exists. -->
            <div id="shareStateBlock" class="mb-4"></div>

            <!-- Primary CTA: generate (when no token), copy (when token).
                 The secondary button is Unshare (token only) or Close. -->
            <div style="display: flex; gap: var(--space-3); width: 100%;">
                <button type="button" id="shareGenerateBtn" class="btn-primary flex-[2]"></button>
                <button type="button" id="shareSecondaryBtn" class="btn-ghost flex-1"></button>
            </div>
        `});n(f,`#modalCloseX`).onclick=()=>h();let g=n(f,`#shareStateBlock`),_=n(f,`#shareGenerateBtn`),v=n(f,`#shareSecondaryBtn`),y=n(f,`#shareCostToggle`),b=n(f,`#sharePlansToggle`),x=r,S=e=>`${window.location.origin}/share/${e}`,C=()=>{if(x){let e=S(x),n=t.shareViews||0;g.innerHTML=`
                <div style="background: rgba(255,255,255,0.96); color: #1d1d1f; padding: var(--space-3) var(--space-4); border-radius: 12px; word-break: break-all; font-family: ui-monospace, monospace; font-size: 0.82rem; font-weight: 600;">${a(e)}</div>
                <div style="display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 0.78rem; color: rgba(255,255,255,0.7); font-weight: 600;">
                    ${a(o(`share.viewsCount`,n,{count:n}))}
                </div>
            `,_.textContent=p(`share.copyBtn`),v.textContent=p(`share.unshareBtn`),v.style.display=``}else g.innerHTML=`
                <div style="padding: var(--space-3) var(--space-4); border-radius: 12px; background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.78); font-size: 0.85rem; text-align: center;">
                    ${a(p(`share.emptyState`))}
                </div>
            `,_.textContent=p(`share.generateBtn`),v.textContent=p(`share.closeBtn`)};C();let w=async()=>{if(x){let e=S(x);try{await navigator.clipboard.writeText(e),i(p(`share.linkCopied`),`success`)}catch{let t=document.createElement(`textarea`);t.value=e,document.body.appendChild(t),t.select();try{document.execCommand(`copy`)}catch{}document.body.removeChild(t),i(p(`share.linkCopied`),`success`)}return}_.disabled=!0,_.textContent=p(`share.generating`);try{let t=await m(`/api/trips/${encodeURIComponent(e.id)}/share`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({showCost:y.checked,showPlans:b.checked})});if(!t.ok)throw Error(`share HTTP ${t.status}`);let n=await t.json();x=n.token;let r=l.trips.find(t=>t.id===e.id)||l.archivedTrips.find(t=>t.id===e.id);r&&(r.shareToken=x,r.shareShowCost=!!n.showCost,r.shareShowPlans=!!n.showPlans,typeof r.shareViews!=`number`&&(r.shareViews=0)),c(`state:changed`),C();try{await navigator.clipboard.writeText(S(x))}catch{}i(p(`share.linkReady`),`success`)}catch(e){console.error(`Generate share link failed:`,e),i(p(`share.generateFailed`)),_.disabled=!1,C()}},T=async()=>{if(!x){h();return}v.disabled=!0,v.textContent=p(`share.unsharing`);try{let t=await m(`/api/trips/${encodeURIComponent(e.id)}/share`,{method:`DELETE`});if(!t.ok)throw Error(`unshare HTTP ${t.status}`);x=null;let n=l.trips.find(t=>t.id===e.id)||l.archivedTrips.find(t=>t.id===e.id);n&&(n.shareToken=null,n.shareShowCost=!1,n.shareShowPlans=!1),c(`state:changed`),C(),i(p(`share.linkRevoked`),`success`)}catch(e){console.error(`Unshare failed:`,e),i(p(`share.revokeFailed`))}finally{v.disabled=!1}},E=async(t,n)=>{if(x)try{let t=await m(`/api/trips/${encodeURIComponent(e.id)}/share`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({showCost:y.checked,showPlans:b.checked})});if(!t.ok)throw Error(`update HTTP ${t.status}`);let n=await t.json();x=n.token;let r=l.trips.find(t=>t.id===e.id)||l.archivedTrips.find(t=>t.id===e.id);r&&(r.shareToken=x,r.shareShowCost=!!n.showCost,r.shareShowPlans=!!n.showPlans),c(`state:changed`),C()}catch(e){console.error(`Toggle ${n} failed:`,e),t.checked=!t.checked,i(p(`share.toggleFailed`))}};y.addEventListener(`change`,()=>void E(y,`showCost`)),b.addEventListener(`change`,()=>void E(b,`showPlans`)),_.onclick=w,v.onclick=T};function y(e){let{trip:t,onShareToFeed:i,showFeedOption:o=!0}=e;if(!t)return;let{root:s,close:c}=d({variant:`glass`,cardStyle:`width: 420px; position: relative;`,innerHTML:`
            ${`
        <button type="button" id="modalCloseX" aria-label="${a(p(`share.closeAriaLabel`))}"
            style="position:absolute; top:14px; right:14px; width:32px; height:32px; border-radius:50%; background:rgba(0,0,0,0.18); border:0; color:#ffffff; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:1.1rem; line-height:1; padding:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `}
            <h2 class="card-title" style="font-size: var(--font-2xl); margin-bottom: var(--space-2); color: #ffffff; letter-spacing: -0.04em; font-weight: 800; text-align: center; padding-right: 32px; padding-left: 32px;">${a(p(`share.chooserTitle`,{name:t.name||`this trip`}))}</h2>
            <p class="mdl-subtitle-hero">
                ${a(p(`share.chooserSubtitle`))}
            </p>

            ${o?`
                <button type="button" id="shareChooserFeedBtn" style="display:flex; align-items:center; gap:14px; width:100%; padding:16px 18px; margin-bottom:12px; background:rgba(255,255,255,0.10); border:1px solid rgba(255,255,255,0.22); border-radius:14px; color:#ffffff; cursor:pointer; text-align:left;">
                    <span class="mdl-icon-1-6">${r(`megaphone`,{size:24})}</span>
                    <span class="flex-1-truncate">
                        <span class="mdl-field-label-block">${a(p(`share.chooserFeedTitle`))}</span>
                        <span class="mdl-field-sublabel">${a(p(`share.chooserFeedBody`))}</span>
                    </span>
                </button>
            `:``}

            <button type="button" id="shareChooserLinkBtn" style="display:flex; align-items:center; gap:14px; width:100%; padding:16px 18px; background:rgba(255,255,255,0.10); border:1px solid rgba(255,255,255,0.22); border-radius:14px; color:#ffffff; cursor:pointer; text-align:left;">
                <span class="mdl-icon-1-6">${r(`link`,{size:24})}</span>
                <span class="flex-1-truncate">
                    <span class="mdl-field-label-block">${a(p(`share.chooserLinkTitle`))}</span>
                    <span class="mdl-field-sublabel">${a(p(`share.chooserLinkBody`))}</span>
                </span>
            </button>

            <button type="button" id="shareChooserCancelBtn" class="btn-ghost" style="width:100%; margin-top:18px;">${a(p(`share.chooserCancel`))}</button>
        `});n(s,`#modalCloseX`).onclick=()=>c();let l=n(s,`#shareChooserFeedBtn`),u=n(s,`#shareChooserLinkBtn`),f=n(s,`#shareChooserCancelBtn`);l&&(l.onclick=()=>{c(),i()}),u.onclick=()=>{c(),v(t)},f.onclick=()=>c()}export{g as i,v as n,_ as r,y as t};
//# sourceMappingURL=share-92FOpeNK.js.map