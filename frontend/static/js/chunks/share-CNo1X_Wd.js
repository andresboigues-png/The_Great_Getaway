import{n as e}from"./rolldown-runtime-Kw0j5LDr.js";import{A as t,Cn as n,Dn as r,Jn as i,Mn as a,T as o,Tt as s,at as c,jn as l,n as u,qn as d,w as f,wt as p,yt as m}from"../app.bundle.js";var h=e({openShareChooserModal:()=>v,openShareTripModal:()=>_,openTripInviteResponseModal:()=>g}),g=e=>{let o=e.related_id?String(e.related_id):``;if(!o)return;let p=!1,h=e.id,g=u(`trip_invite`,e.message),{root:_,close:v}=n({variant:`glass-light`,cardStyle:`width: 440px;`,onClose:()=>{p||h!=null&&m(h)},innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${r(f(`modals.inviteTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.6); line-height: 1.5;">
                ${r(g)}
            </p>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-sm); color: rgba(0,0,0,0.5);">
                ${r(f(`modals.inviteBody`))}
            </p>

            <div style="display: flex; gap: var(--space-3);">
                <button id="tripInviteAcceptBtn" class="btn-primary" style="flex: 2; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">${r(f(`modals.inviteAcceptBtn`))}</button>
                <button id="tripInviteDeclineBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">${r(f(`modals.inviteDeclineBtn`))}</button>
            </div>
        `});l(_,`#tripInviteAcceptBtn`).onclick=async()=>{p=!0;let e=await c(o,!0);if(!e||!e.ok){a(f(`modals.inviteErrorInvalid`)),v();return}v(),await t(),d.trips.find(e=>e.id===o)&&(d.activeTripId=o,i(`state:changed`)),a(f(`modals.inviteSuccessJoined`),`success`),s(`home`)},l(_,`#tripInviteDeclineBtn`).onclick=async()=>{p=!0;let e=await c(o,!1);!e||!e.ok?a(f(`modals.inviteErrorNotActive`)):a(f(`modals.inviteToastDeclined`),`info`),v()}},_=e=>{if(!e)return;let t=d.trips.find(t=>t.id===e.id)||d.archivedTrips.find(t=>t.id===e.id)||e,s=t.shareToken||null,c=!!t.shareShowCost,u=!!t.shareShowPlans,{root:m,close:h}=n({variant:`glass`,cardStyle:`width: 460px; position: relative;`,innerHTML:`
            ${`
        <button type="button" id="modalCloseX" aria-label="${r(f(`share.closeAriaLabel`))}"
            style="position:absolute; top:14px; right:14px; width:32px; height:32px; border-radius:50%; background:rgba(0,0,0,0.18); border:0; color:#ffffff; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `}
            <h2 class="card-title" style="font-size: var(--font-2xl); margin-bottom: var(--space-2); color: #ffffff; letter-spacing: -0.04em; font-weight: 800; text-align: center; padding-left: 32px; padding-right: 32px;">${r(f(`share.linkTitle`))}</h2>
            <p class="mdl-subtitle-hero">
                ${r(f(`share.linkSubtitle`))}
            </p>

            <!-- Privacy toggles. Default off unless the trip already
                 had them on from a previous share. The shared page
                 ALWAYS shows the trip's name, cover photo, and the
                 day-by-day Path; these toggles add layers on top. -->
            <label id="shareCostToggleRow" style="display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: var(--space-3) var(--space-4); background: rgba(255,255,255,0.08); border-radius: 14px; margin-bottom: 10px; cursor: pointer;">
                <input type="checkbox" id="shareCostToggle" ${c?`checked`:``} class="mdl-checkbox-accent">
                <div class="flex-1-truncate">
                    <div class="mdl-text-label-dark">${r(f(`share.toggleCostTitle`))}</div>
                    <div class="mdl-sub-text-fade">${r(f(`share.toggleCostBody`))}</div>
                </div>
            </label>
            <label id="sharePlansToggleRow" style="display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: var(--space-3) var(--space-4); background: rgba(255,255,255,0.08); border-radius: 14px; margin-bottom: var(--space-4); cursor: pointer;">
                <input type="checkbox" id="sharePlansToggle" ${u?`checked`:``} class="mdl-checkbox-accent">
                <div class="flex-1-truncate">
                    <div class="mdl-text-label-dark">${r(f(`share.togglePlansTitle`))}</div>
                    <div class="mdl-sub-text-fade">${r(f(`share.togglePlansBody`))}</div>
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
        `});l(m,`#modalCloseX`).onclick=()=>h();let g=l(m,`#shareStateBlock`),_=l(m,`#shareGenerateBtn`),v=l(m,`#shareSecondaryBtn`),y=l(m,`#shareCostToggle`),b=l(m,`#sharePlansToggle`),x=s,S=e=>`${window.location.origin}/share/${e}`,C=()=>{if(x){let e=S(x),n=t.shareViews||0;g.innerHTML=`
                <div style="background: rgba(255,255,255,0.96); color: #1d1d1f; padding: var(--space-3) var(--space-4); border-radius: 12px; word-break: break-all; font-family: ui-monospace, monospace; font-size: 0.82rem; font-weight: 600;">${r(e)}</div>
                <div style="display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 0.78rem; color: rgba(255,255,255,0.7); font-weight: 600;">
                    ${r(o(`share.viewsCount`,n,{count:n}))}
                </div>
            `,_.textContent=f(`share.copyBtn`),v.textContent=f(`share.unshareBtn`),v.style.display=``}else g.innerHTML=`
                <div style="padding: var(--space-3) var(--space-4); border-radius: 12px; background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.78); font-size: 0.85rem; text-align: center;">
                    ${r(f(`share.emptyState`))}
                </div>
            `,_.textContent=f(`share.generateBtn`),v.textContent=f(`share.closeBtn`)};C();let w=async()=>{if(x){let e=S(x);try{await navigator.clipboard.writeText(e),a(f(`share.linkCopied`),`success`)}catch{let t=document.createElement(`textarea`);t.value=e,document.body.appendChild(t),t.select();try{document.execCommand(`copy`)}catch{}document.body.removeChild(t),a(f(`share.linkCopied`),`success`)}return}_.disabled=!0,_.textContent=f(`share.generating`);try{let t=await p(`/api/trips/${encodeURIComponent(e.id)}/share`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({showCost:y.checked,showPlans:b.checked})});if(!t.ok)throw Error(`share HTTP ${t.status}`);let n=await t.json();x=n.token;let r=d.trips.find(t=>t.id===e.id)||d.archivedTrips.find(t=>t.id===e.id);r&&(r.shareToken=x,r.shareShowCost=!!n.showCost,r.shareShowPlans=!!n.showPlans,typeof r.shareViews!=`number`&&(r.shareViews=0)),i(`state:changed`),C();try{await navigator.clipboard.writeText(S(x))}catch{}a(f(`share.linkReady`),`success`)}catch(e){console.error(`Generate share link failed:`,e),a(f(`share.generateFailed`)),_.disabled=!1,C()}},T=async()=>{if(!x){h();return}v.disabled=!0,v.textContent=f(`share.unsharing`);try{let t=await p(`/api/trips/${encodeURIComponent(e.id)}/share`,{method:`DELETE`});if(!t.ok)throw Error(`unshare HTTP ${t.status}`);x=null;let n=d.trips.find(t=>t.id===e.id)||d.archivedTrips.find(t=>t.id===e.id);n&&(n.shareToken=null,n.shareShowCost=!1,n.shareShowPlans=!1),i(`state:changed`),C(),a(f(`share.linkRevoked`),`success`)}catch(e){console.error(`Unshare failed:`,e),a(f(`share.revokeFailed`))}finally{v.disabled=!1}},E=async(t,n)=>{if(x)try{let t=await p(`/api/trips/${encodeURIComponent(e.id)}/share`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({showCost:y.checked,showPlans:b.checked})});if(!t.ok)throw Error(`update HTTP ${t.status}`);let n=await t.json();x=n.token;let r=d.trips.find(t=>t.id===e.id)||d.archivedTrips.find(t=>t.id===e.id);r&&(r.shareToken=x,r.shareShowCost=!!n.showCost,r.shareShowPlans=!!n.showPlans),i(`state:changed`),C()}catch(e){console.error(`Toggle ${n} failed:`,e),t.checked=!t.checked,a(f(`share.toggleFailed`))}};y.addEventListener(`change`,()=>void E(y,`showCost`)),b.addEventListener(`change`,()=>void E(b,`showPlans`)),_.onclick=w,v.onclick=T};function v(e){let{trip:t,onShareToFeed:i,showFeedOption:a=!0}=e;if(!t)return;let{root:o,close:s}=n({variant:`glass`,cardStyle:`width: 420px; position: relative;`,innerHTML:`
            ${`
        <button type="button" id="modalCloseX" aria-label="${r(f(`share.closeAriaLabel`))}"
            style="position:absolute; top:14px; right:14px; width:32px; height:32px; border-radius:50%; background:rgba(0,0,0,0.18); border:0; color:#ffffff; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:1.1rem; line-height:1; padding:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `}
            <h2 class="card-title" style="font-size: var(--font-2xl); margin-bottom: var(--space-2); color: #ffffff; letter-spacing: -0.04em; font-weight: 800; text-align: center; padding-right: 32px; padding-left: 32px;">${r(f(`share.chooserTitle`,{name:t.name||`this trip`}))}</h2>
            <p class="mdl-subtitle-hero">
                ${r(f(`share.chooserSubtitle`))}
            </p>

            ${a?`
                <button type="button" id="shareChooserFeedBtn" style="display:flex; align-items:center; gap:14px; width:100%; padding:16px 18px; margin-bottom:12px; background:rgba(255,255,255,0.10); border:1px solid rgba(255,255,255,0.22); border-radius:14px; color:#ffffff; cursor:pointer; text-align:left;">
                    <span class="mdl-icon-1-6">📢</span>
                    <span class="flex-1-truncate">
                        <span class="mdl-field-label-block">${r(f(`share.chooserFeedTitle`))}</span>
                        <span class="mdl-field-sublabel">${r(f(`share.chooserFeedBody`))}</span>
                    </span>
                </button>
            `:``}

            <button type="button" id="shareChooserLinkBtn" style="display:flex; align-items:center; gap:14px; width:100%; padding:16px 18px; background:rgba(255,255,255,0.10); border:1px solid rgba(255,255,255,0.22); border-radius:14px; color:#ffffff; cursor:pointer; text-align:left;">
                <span class="mdl-icon-1-6">🔗</span>
                <span class="flex-1-truncate">
                    <span class="mdl-field-label-block">${r(f(`share.chooserLinkTitle`))}</span>
                    <span class="mdl-field-sublabel">${r(f(`share.chooserLinkBody`))}</span>
                </span>
            </button>

            <button type="button" id="shareChooserCancelBtn" class="btn-ghost" style="width:100%; margin-top:18px;">${r(f(`share.chooserCancel`))}</button>
        `});l(o,`#modalCloseX`).onclick=()=>s();let c=l(o,`#shareChooserFeedBtn`),u=l(o,`#shareChooserLinkBtn`),d=l(o,`#shareChooserCancelBtn`);c&&(c.onclick=()=>{s(),i()}),u.onclick=()=>{s(),_(t)},d.onclick=()=>s()}export{h as i,_ as n,g as r,v as t};
//# sourceMappingURL=share-CNo1X_Wd.js.map