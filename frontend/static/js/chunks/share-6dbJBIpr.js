import{n as e}from"./rolldown-runtime-Kw0j5LDr.js";import{A as t,Dn as n,En as r,Hn as i,T as a,Tt as o,Un as s,_n as c,at as l,n as u,w as d,wt as f,xn as p,yt as m}from"../app.bundle.js";var h=e({openShareChooserModal:()=>v,openShareTripModal:()=>_,openTripInviteResponseModal:()=>g}),g=e=>{let a=e.related_id?String(e.related_id):``;if(!a)return;let f=!1,h=e.id,g=u(`trip_invite`,e.message),{root:_,close:v}=c({variant:`glass-light`,cardStyle:`width: 440px;`,onClose:()=>{f||h!=null&&m(h)},innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${p(d(`modals.inviteTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.6); line-height: 1.5;">
                ${p(g)}
            </p>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-sm); color: rgba(0,0,0,0.5);">
                ${p(d(`modals.inviteBody`))}
            </p>

            <div style="display: flex; gap: var(--space-3);">
                <button id="tripInviteAcceptBtn" class="btn-primary" style="flex: 2; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">${p(d(`modals.inviteAcceptBtn`))}</button>
                <button id="tripInviteDeclineBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">${p(d(`modals.inviteDeclineBtn`))}</button>
            </div>
        `});r(_,`#tripInviteAcceptBtn`).onclick=async()=>{f=!0;let e=await l(a,!0);if(!e||!e.ok){n(d(`modals.inviteErrorInvalid`)),v();return}v(),await t(),i.trips.find(e=>e.id===a)&&(i.activeTripId=a,s(`state:changed`)),n(d(`modals.inviteSuccessJoined`),`success`),o(`home`)},r(_,`#tripInviteDeclineBtn`).onclick=async()=>{f=!0;let e=await l(a,!1);!e||!e.ok?n(d(`modals.inviteErrorNotActive`)):n(d(`modals.inviteToastDeclined`),`info`),v()}},_=e=>{if(!e)return;let t=i.trips.find(t=>t.id===e.id)||i.archivedTrips.find(t=>t.id===e.id)||e,o=t.shareToken||null,l=!!t.shareShowCost,u=!!t.shareShowPlans,{root:m,close:h}=c({variant:`glass`,cardStyle:`width: 460px; position: relative;`,innerHTML:`
            ${`
        <button type="button" id="modalCloseX" aria-label="${p(d(`share.closeAriaLabel`))}"
            style="position:absolute; top:14px; right:14px; width:32px; height:32px; border-radius:50%; background:rgba(0,0,0,0.18); border:0; color:#ffffff; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `}
            <h2 class="card-title" style="font-size: var(--font-2xl); margin-bottom: var(--space-2); color: #ffffff; letter-spacing: -0.04em; font-weight: 800; text-align: center; padding-left: 32px; padding-right: 32px;">${p(d(`share.linkTitle`))}</h2>
            <p class="mdl-subtitle-hero">
                ${p(d(`share.linkSubtitle`))}
            </p>

            <!-- Privacy toggles. Default off unless the trip already
                 had them on from a previous share. The shared page
                 ALWAYS shows the trip's name, cover photo, and the
                 day-by-day Path; these toggles add layers on top. -->
            <label id="shareCostToggleRow" style="display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: var(--space-3) var(--space-4); background: rgba(255,255,255,0.08); border-radius: 14px; margin-bottom: 10px; cursor: pointer;">
                <input type="checkbox" id="shareCostToggle" ${l?`checked`:``} class="mdl-checkbox-accent">
                <div class="flex-1-truncate">
                    <div class="mdl-text-label-dark">${p(d(`share.toggleCostTitle`))}</div>
                    <div class="mdl-sub-text-fade">${p(d(`share.toggleCostBody`))}</div>
                </div>
            </label>
            <label id="sharePlansToggleRow" style="display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: var(--space-3) var(--space-4); background: rgba(255,255,255,0.08); border-radius: 14px; margin-bottom: var(--space-4); cursor: pointer;">
                <input type="checkbox" id="sharePlansToggle" ${u?`checked`:``} class="mdl-checkbox-accent">
                <div class="flex-1-truncate">
                    <div class="mdl-text-label-dark">${p(d(`share.togglePlansTitle`))}</div>
                    <div class="mdl-sub-text-fade">${p(d(`share.togglePlansBody`))}</div>
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
        `});r(m,`#modalCloseX`).onclick=()=>h();let g=r(m,`#shareStateBlock`),_=r(m,`#shareGenerateBtn`),v=r(m,`#shareSecondaryBtn`),y=r(m,`#shareCostToggle`),b=r(m,`#sharePlansToggle`),x=o,S=e=>`${window.location.origin}/share/${e}`,C=()=>{if(x){let e=S(x),n=t.shareViews||0;g.innerHTML=`
                <div style="background: rgba(255,255,255,0.96); color: #1d1d1f; padding: var(--space-3) var(--space-4); border-radius: 12px; word-break: break-all; font-family: ui-monospace, monospace; font-size: 0.82rem; font-weight: 600;">${p(e)}</div>
                <div style="display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 0.78rem; color: rgba(255,255,255,0.7); font-weight: 600;">
                    ${p(a(`share.viewsCount`,n,{count:n}))}
                </div>
            `,_.textContent=d(`share.copyBtn`),v.textContent=d(`share.unshareBtn`),v.style.display=``}else g.innerHTML=`
                <div style="padding: var(--space-3) var(--space-4); border-radius: 12px; background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.78); font-size: 0.85rem; text-align: center;">
                    ${p(d(`share.emptyState`))}
                </div>
            `,_.textContent=d(`share.generateBtn`),v.textContent=d(`share.closeBtn`)};C();let w=async()=>{if(x){let e=S(x);try{await navigator.clipboard.writeText(e),n(d(`share.linkCopied`),`success`)}catch{let t=document.createElement(`textarea`);t.value=e,document.body.appendChild(t),t.select();try{document.execCommand(`copy`)}catch{}document.body.removeChild(t),n(d(`share.linkCopied`),`success`)}return}_.disabled=!0,_.textContent=d(`share.generating`);try{let t=await f(`/api/trips/${encodeURIComponent(e.id)}/share`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({showCost:y.checked,showPlans:b.checked})});if(!t.ok)throw Error(`share HTTP ${t.status}`);let r=await t.json();x=r.token;let a=i.trips.find(t=>t.id===e.id)||i.archivedTrips.find(t=>t.id===e.id);a&&(a.shareToken=x,a.shareShowCost=!!r.showCost,a.shareShowPlans=!!r.showPlans,typeof a.shareViews!=`number`&&(a.shareViews=0)),s(`state:changed`),C();try{await navigator.clipboard.writeText(S(x))}catch{}n(d(`share.linkReady`),`success`)}catch(e){console.error(`Generate share link failed:`,e),n(d(`share.generateFailed`)),_.disabled=!1,C()}},T=async()=>{if(!x){h();return}v.disabled=!0,v.textContent=d(`share.unsharing`);try{let t=await f(`/api/trips/${encodeURIComponent(e.id)}/share`,{method:`DELETE`});if(!t.ok)throw Error(`unshare HTTP ${t.status}`);x=null;let r=i.trips.find(t=>t.id===e.id)||i.archivedTrips.find(t=>t.id===e.id);r&&(r.shareToken=null,r.shareShowCost=!1,r.shareShowPlans=!1),s(`state:changed`),C(),n(d(`share.linkRevoked`),`success`)}catch(e){console.error(`Unshare failed:`,e),n(d(`share.revokeFailed`))}finally{v.disabled=!1}},E=async(t,r)=>{if(x)try{let t=await f(`/api/trips/${encodeURIComponent(e.id)}/share`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({showCost:y.checked,showPlans:b.checked})});if(!t.ok)throw Error(`update HTTP ${t.status}`);let n=await t.json();x=n.token;let r=i.trips.find(t=>t.id===e.id)||i.archivedTrips.find(t=>t.id===e.id);r&&(r.shareToken=x,r.shareShowCost=!!n.showCost,r.shareShowPlans=!!n.showPlans),s(`state:changed`),C()}catch(e){console.error(`Toggle ${r} failed:`,e),t.checked=!t.checked,n(d(`share.toggleFailed`))}};y.addEventListener(`change`,()=>void E(y,`showCost`)),b.addEventListener(`change`,()=>void E(b,`showPlans`)),_.onclick=w,v.onclick=T};function v(e){let{trip:t,onShareToFeed:n,showFeedOption:i=!0}=e;if(!t)return;let{root:a,close:o}=c({variant:`glass`,cardStyle:`width: 420px; position: relative;`,innerHTML:`
            ${`
        <button type="button" id="modalCloseX" aria-label="${p(d(`share.closeAriaLabel`))}"
            style="position:absolute; top:14px; right:14px; width:32px; height:32px; border-radius:50%; background:rgba(0,0,0,0.18); border:0; color:#ffffff; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:1.1rem; line-height:1; padding:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `}
            <h2 class="card-title" style="font-size: var(--font-2xl); margin-bottom: var(--space-2); color: #ffffff; letter-spacing: -0.04em; font-weight: 800; text-align: center; padding-right: 32px; padding-left: 32px;">${p(d(`share.chooserTitle`,{name:t.name||`this trip`}))}</h2>
            <p class="mdl-subtitle-hero">
                ${p(d(`share.chooserSubtitle`))}
            </p>

            ${i?`
                <button type="button" id="shareChooserFeedBtn" style="display:flex; align-items:center; gap:14px; width:100%; padding:16px 18px; margin-bottom:12px; background:rgba(255,255,255,0.10); border:1px solid rgba(255,255,255,0.22); border-radius:14px; color:#ffffff; cursor:pointer; text-align:left;">
                    <span class="mdl-icon-1-6">📢</span>
                    <span class="flex-1-truncate">
                        <span class="mdl-field-label-block">${p(d(`share.chooserFeedTitle`))}</span>
                        <span class="mdl-field-sublabel">${p(d(`share.chooserFeedBody`))}</span>
                    </span>
                </button>
            `:``}

            <button type="button" id="shareChooserLinkBtn" style="display:flex; align-items:center; gap:14px; width:100%; padding:16px 18px; background:rgba(255,255,255,0.10); border:1px solid rgba(255,255,255,0.22); border-radius:14px; color:#ffffff; cursor:pointer; text-align:left;">
                <span class="mdl-icon-1-6">🔗</span>
                <span class="flex-1-truncate">
                    <span class="mdl-field-label-block">${p(d(`share.chooserLinkTitle`))}</span>
                    <span class="mdl-field-sublabel">${p(d(`share.chooserLinkBody`))}</span>
                </span>
            </button>

            <button type="button" id="shareChooserCancelBtn" class="btn-ghost" style="width:100%; margin-top:18px;">${p(d(`share.chooserCancel`))}</button>
        `});r(a,`#modalCloseX`).onclick=()=>o();let s=r(a,`#shareChooserFeedBtn`),l=r(a,`#shareChooserLinkBtn`),u=r(a,`#shareChooserCancelBtn`);s&&(s.onclick=()=>{o(),n()}),l.onclick=()=>{o(),_(t)},u.onclick=()=>o()}export{h as i,_ as n,g as r,v as t};
//# sourceMappingURL=share-6dbJBIpr.js.map