import{n as e}from"./rolldown-runtime-Kw0j5LDr.js";import{C as t,O as n,Qt as r,S as i,Tn as a,bt as o,cn as s,d as c,ln as l,nt as u,rn as d,wn as f,xt as p}from"../app.bundle.js";var m=e({openShareChooserModal:()=>_,openShareTripModal:()=>g,openTripInviteResponseModal:()=>h}),h=e=>{let t=e.related_id?String(e.related_id):``;if(!t)return;let o=c(`trip_invite`,e.message),{root:m,close:h}=r({variant:`glass-light`,cardStyle:`width: 440px;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${d(i(`modals.inviteTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.6); line-height: 1.5;">
                ${d(o)}
            </p>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-sm); color: rgba(0,0,0,0.5);">
                ${d(i(`modals.inviteBody`))}
            </p>

            <div style="display: flex; gap: var(--space-3);">
                <button id="tripInviteAcceptBtn" class="btn-primary" style="flex: 2; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">${d(i(`modals.inviteAcceptBtn`))}</button>
                <button id="tripInviteDeclineBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">${d(i(`modals.inviteDeclineBtn`))}</button>
            </div>
        `});s(m,`#tripInviteAcceptBtn`).onclick=async()=>{let e=await u(t,!0);if(!e||!e.ok){l(i(`modals.inviteErrorInvalid`)),h();return}h(),await n(),f.trips.find(e=>e.id===t)&&(f.activeTripId=t,a(`state:changed`)),l(i(`modals.inviteSuccessJoined`),`success`),p(`home`)},s(m,`#tripInviteDeclineBtn`).onclick=async()=>{let e=await u(t,!1);!e||!e.ok?l(i(`modals.inviteErrorNotActive`)):l(i(`modals.inviteToastDeclined`),`info`),h()}},g=e=>{if(!e)return;let n=f.trips.find(t=>t.id===e.id)||f.archivedTrips.find(t=>t.id===e.id)||e,c=n.shareToken||null,u=!!n.shareShowCost,p=!!n.shareShowPlans,{root:m,close:h}=r({variant:`glass`,cardStyle:`width: 460px; position: relative;`,innerHTML:`
            ${`
        <button type="button" id="modalCloseX" aria-label="${d(i(`share.closeAriaLabel`))}"
            style="position:absolute; top:14px; right:14px; width:32px; height:32px; border-radius:50%; background:rgba(0,0,0,0.18); border:0; color:#ffffff; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `}
            <h2 class="card-title" style="font-size: var(--font-2xl); margin-bottom: var(--space-2); color: #ffffff; letter-spacing: -0.04em; font-weight: 800; text-align: center; padding-left: 32px; padding-right: 32px;">${d(i(`share.linkTitle`))}</h2>
            <p class="mdl-subtitle-hero">
                ${d(i(`share.linkSubtitle`))}
            </p>

            <!-- Privacy toggles. Default off unless the trip already
                 had them on from a previous share. The shared page
                 ALWAYS shows the trip's name, cover photo, and the
                 day-by-day Path; these toggles add layers on top. -->
            <label id="shareCostToggleRow" style="display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: var(--space-3) var(--space-4); background: rgba(255,255,255,0.08); border-radius: 14px; margin-bottom: 10px; cursor: pointer;">
                <input type="checkbox" id="shareCostToggle" ${u?`checked`:``} class="mdl-checkbox-accent">
                <div class="flex-1-truncate">
                    <div class="mdl-text-label-dark">${d(i(`share.toggleCostTitle`))}</div>
                    <div class="mdl-sub-text-fade">${d(i(`share.toggleCostBody`))}</div>
                </div>
            </label>
            <label id="sharePlansToggleRow" style="display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: var(--space-3) var(--space-4); background: rgba(255,255,255,0.08); border-radius: 14px; margin-bottom: var(--space-4); cursor: pointer;">
                <input type="checkbox" id="sharePlansToggle" ${p?`checked`:``} class="mdl-checkbox-accent">
                <div class="flex-1-truncate">
                    <div class="mdl-text-label-dark">${d(i(`share.togglePlansTitle`))}</div>
                    <div class="mdl-sub-text-fade">${d(i(`share.togglePlansBody`))}</div>
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
        `});s(m,`#modalCloseX`).onclick=()=>h();let g=s(m,`#shareStateBlock`),_=s(m,`#shareGenerateBtn`),v=s(m,`#shareSecondaryBtn`),y=s(m,`#shareCostToggle`),b=s(m,`#sharePlansToggle`),x=c,S=e=>`${window.location.origin}/share/${e}`,C=()=>{if(x){let e=S(x),r=n.shareViews||0;g.innerHTML=`
                <div style="background: rgba(255,255,255,0.96); color: #1d1d1f; padding: var(--space-3) var(--space-4); border-radius: 12px; word-break: break-all; font-family: ui-monospace, monospace; font-size: 0.82rem; font-weight: 600;">${d(e)}</div>
                <div style="display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 0.78rem; color: rgba(255,255,255,0.7); font-weight: 600;">
                    ${d(t(`share.viewsCount`,r,{count:r}))}
                </div>
            `,_.textContent=i(`share.copyBtn`),v.textContent=i(`share.unshareBtn`),v.style.display=``}else g.innerHTML=`
                <div style="padding: var(--space-3) var(--space-4); border-radius: 12px; background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.78); font-size: 0.85rem; text-align: center;">
                    ${d(i(`share.emptyState`))}
                </div>
            `,_.textContent=i(`share.generateBtn`),v.textContent=i(`share.closeBtn`)};C();let w=async()=>{if(x){let e=S(x);try{await navigator.clipboard.writeText(e),l(i(`share.linkCopied`),`success`)}catch{let t=document.createElement(`textarea`);t.value=e,document.body.appendChild(t),t.select();try{document.execCommand(`copy`)}catch{}document.body.removeChild(t),l(i(`share.linkCopied`),`success`)}return}_.disabled=!0,_.textContent=i(`share.generating`);try{let t=await o(`/api/trips/${encodeURIComponent(e.id)}/share`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({showCost:y.checked,showPlans:b.checked})});if(!t.ok)throw Error(`share HTTP ${t.status}`);let n=await t.json();x=n.token;let r=f.trips.find(t=>t.id===e.id)||f.archivedTrips.find(t=>t.id===e.id);r&&(r.shareToken=x,r.shareShowCost=!!n.showCost,r.shareShowPlans=!!n.showPlans,typeof r.shareViews!=`number`&&(r.shareViews=0)),a(`state:changed`),C();try{await navigator.clipboard.writeText(S(x))}catch{}l(i(`share.linkReady`),`success`)}catch(e){console.error(`Generate share link failed:`,e),l(i(`share.generateFailed`)),_.disabled=!1,C()}},T=async()=>{if(!x){h();return}v.disabled=!0,v.textContent=i(`share.unsharing`);try{let t=await o(`/api/trips/${encodeURIComponent(e.id)}/share`,{method:`DELETE`});if(!t.ok)throw Error(`unshare HTTP ${t.status}`);x=null;let n=f.trips.find(t=>t.id===e.id)||f.archivedTrips.find(t=>t.id===e.id);n&&(n.shareToken=null,n.shareShowCost=!1,n.shareShowPlans=!1),a(`state:changed`),C(),l(i(`share.linkRevoked`),`success`)}catch(e){console.error(`Unshare failed:`,e),l(i(`share.revokeFailed`))}finally{v.disabled=!1}},E=async(t,n)=>{if(x)try{let t=await o(`/api/trips/${encodeURIComponent(e.id)}/share`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({showCost:y.checked,showPlans:b.checked})});if(!t.ok)throw Error(`update HTTP ${t.status}`);let n=await t.json();x=n.token;let r=f.trips.find(t=>t.id===e.id)||f.archivedTrips.find(t=>t.id===e.id);r&&(r.shareToken=x,r.shareShowCost=!!n.showCost,r.shareShowPlans=!!n.showPlans),a(`state:changed`),C()}catch(e){console.error(`Toggle ${n} failed:`,e),t.checked=!t.checked,l(i(`share.toggleFailed`))}};y.addEventListener(`change`,()=>void E(y,`showCost`)),b.addEventListener(`change`,()=>void E(b,`showPlans`)),_.onclick=w,v.onclick=T};function _(e){let{trip:t,onShareToFeed:n,showFeedOption:a=!0}=e;if(!t)return;let{root:o,close:c}=r({variant:`glass`,cardStyle:`width: 420px; position: relative;`,innerHTML:`
            ${`
        <button type="button" id="modalCloseX" aria-label="${d(i(`share.closeAriaLabel`))}"
            style="position:absolute; top:14px; right:14px; width:32px; height:32px; border-radius:50%; background:rgba(0,0,0,0.18); border:0; color:#ffffff; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:1.1rem; line-height:1; padding:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `}
            <h2 class="card-title" style="font-size: var(--font-2xl); margin-bottom: var(--space-2); color: #ffffff; letter-spacing: -0.04em; font-weight: 800; text-align: center; padding-right: 32px; padding-left: 32px;">${d(i(`share.chooserTitle`,{name:t.name||`this trip`}))}</h2>
            <p class="mdl-subtitle-hero">
                ${d(i(`share.chooserSubtitle`))}
            </p>

            ${a?`
                <button type="button" id="shareChooserFeedBtn" style="display:flex; align-items:center; gap:14px; width:100%; padding:16px 18px; margin-bottom:12px; background:rgba(255,255,255,0.10); border:1px solid rgba(255,255,255,0.22); border-radius:14px; color:#ffffff; cursor:pointer; text-align:left;">
                    <span class="mdl-icon-1-6">📢</span>
                    <span class="flex-1-truncate">
                        <span class="mdl-field-label-block">${d(i(`share.chooserFeedTitle`))}</span>
                        <span class="mdl-field-sublabel">${d(i(`share.chooserFeedBody`))}</span>
                    </span>
                </button>
            `:``}

            <button type="button" id="shareChooserLinkBtn" style="display:flex; align-items:center; gap:14px; width:100%; padding:16px 18px; background:rgba(255,255,255,0.10); border:1px solid rgba(255,255,255,0.22); border-radius:14px; color:#ffffff; cursor:pointer; text-align:left;">
                <span class="mdl-icon-1-6">🔗</span>
                <span class="flex-1-truncate">
                    <span class="mdl-field-label-block">${d(i(`share.chooserLinkTitle`))}</span>
                    <span class="mdl-field-sublabel">${d(i(`share.chooserLinkBody`))}</span>
                </span>
            </button>

            <button type="button" id="shareChooserCancelBtn" class="btn-ghost" style="width:100%; margin-top:18px;">${d(i(`share.chooserCancel`))}</button>
        `});s(o,`#modalCloseX`).onclick=()=>c();let l=s(o,`#shareChooserFeedBtn`),u=s(o,`#shareChooserLinkBtn`),f=s(o,`#shareChooserCancelBtn`);l&&(l.onclick=()=>{c(),n()}),u.onclick=()=>{c(),g(t)},f.onclick=()=>c()}export{m as n,_ as t};
//# sourceMappingURL=share-BHXScMGU.js.map