import{n as e}from"./rolldown-runtime-Kw0j5LDr.js";import{Mn as t,N as n,Nn as r,Nt as i,Ot as a,P as o,Pt as s,_n as c,d as l,dn as u,gn as d,mt as f,on as p,z as m}from"../app.bundle.js";var h=e({openShareChooserModal:()=>v,openShareTripModal:()=>_,openTripInviteResponseModal:()=>g}),g=e=>{let i=e.related_id?String(e.related_id):``;if(!i)return;let o=!1,h=e.id,g=l(`trip_invite`,e.message),{root:_,close:v}=p({variant:`glass-light`,cardStyle:`width: 440px;`,onClose:()=>{o||h!=null&&a(h)},innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${u(n(`modals.inviteTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.6); line-height: 1.5;">
                ${u(g)}
            </p>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-sm); color: rgba(0,0,0,0.5);">
                ${u(n(`modals.inviteBody`))}
            </p>

            <div style="display: flex; gap: var(--space-3);">
                <button id="tripInviteAcceptBtn" class="btn-primary" style="flex: 2; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">${u(n(`modals.inviteAcceptBtn`))}</button>
                <button id="tripInviteDeclineBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">${u(n(`modals.inviteDeclineBtn`))}</button>
            </div>
        `});d(_,`#tripInviteAcceptBtn`).onclick=async()=>{o=!0;let e=await f(i,!0);if(!e||!e.ok){c(n(`modals.inviteErrorInvalid`)),v();return}v(),await m(),t.trips.find(e=>e.id===i)&&(t.activeTripId=i,r(`state:changed`)),c(n(`modals.inviteSuccessJoined`),`success`),s(`home`)},d(_,`#tripInviteDeclineBtn`).onclick=async()=>{o=!0;let e=await f(i,!1);!e||!e.ok?c(n(`modals.inviteErrorNotActive`)):c(n(`modals.inviteToastDeclined`),`info`),v()}},_=e=>{if(!e)return;let a=t.trips.find(t=>t.id===e.id)||t.archivedTrips.find(t=>t.id===e.id)||e,s=a.shareToken||null,l=!!a.shareShowCost,f=!!a.shareShowPlans,{root:m,close:h}=p({variant:`glass`,cardStyle:`width: 460px; position: relative;`,innerHTML:`
            ${`
        <button type="button" id="modalCloseX" aria-label="${u(n(`share.closeAriaLabel`))}"
            style="position:absolute; top:14px; right:14px; width:32px; height:32px; border-radius:50%; background:rgba(0,0,0,0.18); border:0; color:#ffffff; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `}
            <h2 class="card-title" style="font-size: var(--font-2xl); margin-bottom: var(--space-2); color: #ffffff; letter-spacing: -0.04em; font-weight: 800; text-align: center; padding-left: 32px; padding-right: 32px;">${u(n(`share.linkTitle`))}</h2>
            <p class="mdl-subtitle-hero">
                ${u(n(`share.linkSubtitle`))}
            </p>

            <!-- Privacy toggles. Default off unless the trip already
                 had them on from a previous share. The shared page
                 ALWAYS shows the trip's name, cover photo, and the
                 day-by-day Path; these toggles add layers on top. -->
            <label id="shareCostToggleRow" style="display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: var(--space-3) var(--space-4); background: rgba(255,255,255,0.08); border-radius: 14px; margin-bottom: 10px; cursor: pointer;">
                <input type="checkbox" id="shareCostToggle" ${l?`checked`:``} class="mdl-checkbox-accent">
                <div class="flex-1-truncate">
                    <div class="mdl-text-label-dark">${u(n(`share.toggleCostTitle`))}</div>
                    <div class="mdl-sub-text-fade">${u(n(`share.toggleCostBody`))}</div>
                </div>
            </label>
            <label id="sharePlansToggleRow" style="display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: var(--space-3) var(--space-4); background: rgba(255,255,255,0.08); border-radius: 14px; margin-bottom: var(--space-4); cursor: pointer;">
                <input type="checkbox" id="sharePlansToggle" ${f?`checked`:``} class="mdl-checkbox-accent">
                <div class="flex-1-truncate">
                    <div class="mdl-text-label-dark">${u(n(`share.togglePlansTitle`))}</div>
                    <div class="mdl-sub-text-fade">${u(n(`share.togglePlansBody`))}</div>
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
        `});d(m,`#modalCloseX`).onclick=()=>h();let g=d(m,`#shareStateBlock`),_=d(m,`#shareGenerateBtn`),v=d(m,`#shareSecondaryBtn`),y=d(m,`#shareCostToggle`),b=d(m,`#sharePlansToggle`),x=s,S=e=>`${window.location.origin}/share/${e}`,C=()=>{if(x){let e=S(x),t=a.shareViews||0;g.innerHTML=`
                <div style="background: rgba(255,255,255,0.96); color: #1d1d1f; padding: var(--space-3) var(--space-4); border-radius: 12px; word-break: break-all; font-family: ui-monospace, monospace; font-size: 0.82rem; font-weight: 600;">${u(e)}</div>
                <div style="display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 0.78rem; color: rgba(255,255,255,0.7); font-weight: 600;">
                    ${u(o(`share.viewsCount`,t,{count:t}))}
                </div>
            `,_.textContent=n(`share.copyBtn`),v.textContent=n(`share.unshareBtn`),v.style.display=``}else g.innerHTML=`
                <div style="padding: var(--space-3) var(--space-4); border-radius: 12px; background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.78); font-size: 0.85rem; text-align: center;">
                    ${u(n(`share.emptyState`))}
                </div>
            `,_.textContent=n(`share.generateBtn`),v.textContent=n(`share.closeBtn`)};C();let w=async()=>{if(x){let e=S(x);try{await navigator.clipboard.writeText(e),c(n(`share.linkCopied`),`success`)}catch{let t=document.createElement(`textarea`);t.value=e,document.body.appendChild(t),t.select();try{document.execCommand(`copy`)}catch{}document.body.removeChild(t),c(n(`share.linkCopied`),`success`)}return}_.disabled=!0,_.textContent=n(`share.generating`);try{let a=await i(`/api/trips/${encodeURIComponent(e.id)}/share`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({showCost:y.checked,showPlans:b.checked})});if(!a.ok)throw Error(`share HTTP ${a.status}`);let o=await a.json();x=o.token;let s=t.trips.find(t=>t.id===e.id)||t.archivedTrips.find(t=>t.id===e.id);s&&(s.shareToken=x,s.shareShowCost=!!o.showCost,s.shareShowPlans=!!o.showPlans,typeof s.shareViews!=`number`&&(s.shareViews=0)),r(`state:changed`),C();try{await navigator.clipboard.writeText(S(x))}catch{}c(n(`share.linkReady`),`success`)}catch(e){console.error(`Generate share link failed:`,e),c(n(`share.generateFailed`)),_.disabled=!1,C()}},T=async()=>{if(!x){h();return}v.disabled=!0,v.textContent=n(`share.unsharing`);try{let a=await i(`/api/trips/${encodeURIComponent(e.id)}/share`,{method:`DELETE`});if(!a.ok)throw Error(`unshare HTTP ${a.status}`);x=null;let o=t.trips.find(t=>t.id===e.id)||t.archivedTrips.find(t=>t.id===e.id);o&&(o.shareToken=null,o.shareShowCost=!1,o.shareShowPlans=!1),r(`state:changed`),C(),c(n(`share.linkRevoked`),`success`)}catch(e){console.error(`Unshare failed:`,e),c(n(`share.revokeFailed`))}finally{v.disabled=!1}},E=async(a,o)=>{if(x)try{let n=await i(`/api/trips/${encodeURIComponent(e.id)}/share`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({showCost:y.checked,showPlans:b.checked})});if(!n.ok)throw Error(`update HTTP ${n.status}`);let a=await n.json();x=a.token;let o=t.trips.find(t=>t.id===e.id)||t.archivedTrips.find(t=>t.id===e.id);o&&(o.shareToken=x,o.shareShowCost=!!a.showCost,o.shareShowPlans=!!a.showPlans),r(`state:changed`),C()}catch(e){console.error(`Toggle ${o} failed:`,e),a.checked=!a.checked,c(n(`share.toggleFailed`))}};y.addEventListener(`change`,()=>void E(y,`showCost`)),b.addEventListener(`change`,()=>void E(b,`showPlans`)),_.onclick=w,v.onclick=T};function v(e){let{trip:t,onShareToFeed:r,showFeedOption:i=!0}=e;if(!t)return;let{root:a,close:o}=p({variant:`glass`,cardStyle:`width: 420px; position: relative;`,innerHTML:`
            ${`
        <button type="button" id="modalCloseX" aria-label="${u(n(`share.closeAriaLabel`))}"
            style="position:absolute; top:14px; right:14px; width:32px; height:32px; border-radius:50%; background:rgba(0,0,0,0.18); border:0; color:#ffffff; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:1.1rem; line-height:1; padding:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `}
            <h2 class="card-title" style="font-size: var(--font-2xl); margin-bottom: var(--space-2); color: #ffffff; letter-spacing: -0.04em; font-weight: 800; text-align: center; padding-right: 32px; padding-left: 32px;">${u(n(`share.chooserTitle`,{name:t.name||`this trip`}))}</h2>
            <p class="mdl-subtitle-hero">
                ${u(n(`share.chooserSubtitle`))}
            </p>

            ${i?`
                <button type="button" id="shareChooserFeedBtn" style="display:flex; align-items:center; gap:14px; width:100%; padding:16px 18px; margin-bottom:12px; background:rgba(255,255,255,0.10); border:1px solid rgba(255,255,255,0.22); border-radius:14px; color:#ffffff; cursor:pointer; text-align:left;">
                    <span class="mdl-icon-1-6">📢</span>
                    <span class="flex-1-truncate">
                        <span class="mdl-field-label-block">${u(n(`share.chooserFeedTitle`))}</span>
                        <span class="mdl-field-sublabel">${u(n(`share.chooserFeedBody`))}</span>
                    </span>
                </button>
            `:``}

            <button type="button" id="shareChooserLinkBtn" style="display:flex; align-items:center; gap:14px; width:100%; padding:16px 18px; background:rgba(255,255,255,0.10); border:1px solid rgba(255,255,255,0.22); border-radius:14px; color:#ffffff; cursor:pointer; text-align:left;">
                <span class="mdl-icon-1-6">🔗</span>
                <span class="flex-1-truncate">
                    <span class="mdl-field-label-block">${u(n(`share.chooserLinkTitle`))}</span>
                    <span class="mdl-field-sublabel">${u(n(`share.chooserLinkBody`))}</span>
                </span>
            </button>

            <button type="button" id="shareChooserCancelBtn" class="btn-ghost" style="width:100%; margin-top:18px;">${u(n(`share.chooserCancel`))}</button>
        `});d(a,`#modalCloseX`).onclick=()=>o();let s=d(a,`#shareChooserFeedBtn`),c=d(a,`#shareChooserLinkBtn`),l=d(a,`#shareChooserCancelBtn`);s&&(s.onclick=()=>{o(),r()}),c.onclick=()=>{o(),_(t)},l.onclick=()=>o()}export{h as i,_ as n,g as r,v as t};
//# sourceMappingURL=share-C6e89dOK.js.map