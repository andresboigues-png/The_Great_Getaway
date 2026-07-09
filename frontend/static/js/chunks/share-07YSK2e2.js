import{n as e}from"./rolldown-runtime-Kw0j5LDr.js";import{Cn as t,N as n,Nt as r,Ot as i,P as a,Pt as o,Rn as s,Sn as c,_n as l,d as u,fn as d,mt as f,z as p,zn as m}from"../app.bundle.js";var h=e({openShareChooserModal:()=>v,openShareTripModal:()=>_,openTripInviteResponseModal:()=>g}),g=e=>{let r=e.related_id?String(e.related_id):``;if(!r)return;let a=!1,h=e.id,g=u(`trip_invite`,e.message),{root:_,close:v}=d({variant:`glass-light`,cardStyle:`width: 440px;`,onClose:()=>{a||h!=null&&i(h)},innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${l(n(`modals.inviteTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.6); line-height: 1.5;">
                ${l(g)}
            </p>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-sm); color: rgba(0,0,0,0.5);">
                ${l(n(`modals.inviteBody`))}
            </p>

            <div style="display: flex; gap: var(--space-3);">
                <button id="tripInviteAcceptBtn" class="btn-primary" style="flex: 2; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">${l(n(`modals.inviteAcceptBtn`))}</button>
                <button id="tripInviteDeclineBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">${l(n(`modals.inviteDeclineBtn`))}</button>
            </div>
        `});c(_,`#tripInviteAcceptBtn`).onclick=async()=>{a=!0;let e=await f(r,!0);if(!e||!e.ok){t(n(`modals.inviteErrorInvalid`)),v();return}v(),await p(),s.trips.find(e=>e.id===r)&&(s.activeTripId=r,m(`state:changed`)),t(n(`modals.inviteSuccessJoined`),`success`),o(`home`)},c(_,`#tripInviteDeclineBtn`).onclick=async()=>{a=!0;let e=await f(r,!1);!e||!e.ok?t(n(`modals.inviteErrorNotActive`)):t(n(`modals.inviteToastDeclined`),`info`),v()}},_=e=>{if(!e)return;let i=s.trips.find(t=>t.id===e.id)||s.archivedTrips.find(t=>t.id===e.id)||e,o=i.shareToken||null,u=!!i.shareShowCost,f=!!i.shareShowPlans,{root:p,close:h}=d({variant:`glass`,cardStyle:`width: 460px; position: relative;`,innerHTML:`
            ${`
        <button type="button" id="modalCloseX" aria-label="${l(n(`share.closeAriaLabel`))}"
            style="position:absolute; top:14px; right:14px; width:32px; height:32px; border-radius:50%; background:rgba(0,0,0,0.18); border:0; color:#ffffff; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `}
            <h2 class="card-title" style="font-size: var(--font-2xl); margin-bottom: var(--space-2); color: #ffffff; letter-spacing: -0.04em; font-weight: 800; text-align: center; padding-left: 32px; padding-right: 32px;">${l(n(`share.linkTitle`))}</h2>
            <p class="mdl-subtitle-hero">
                ${l(n(`share.linkSubtitle`))}
            </p>

            <!-- Privacy toggles. Default off unless the trip already
                 had them on from a previous share. The shared page
                 ALWAYS shows the trip's name, cover photo, and the
                 day-by-day Path; these toggles add layers on top. -->
            <label id="shareCostToggleRow" style="display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: var(--space-3) var(--space-4); background: rgba(255,255,255,0.08); border-radius: 14px; margin-bottom: 10px; cursor: pointer;">
                <input type="checkbox" id="shareCostToggle" ${u?`checked`:``} class="mdl-checkbox-accent">
                <div class="flex-1-truncate">
                    <div class="mdl-text-label-dark">${l(n(`share.toggleCostTitle`))}</div>
                    <div class="mdl-sub-text-fade">${l(n(`share.toggleCostBody`))}</div>
                </div>
            </label>
            <label id="sharePlansToggleRow" style="display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: var(--space-3) var(--space-4); background: rgba(255,255,255,0.08); border-radius: 14px; margin-bottom: var(--space-4); cursor: pointer;">
                <input type="checkbox" id="sharePlansToggle" ${f?`checked`:``} class="mdl-checkbox-accent">
                <div class="flex-1-truncate">
                    <div class="mdl-text-label-dark">${l(n(`share.togglePlansTitle`))}</div>
                    <div class="mdl-sub-text-fade">${l(n(`share.togglePlansBody`))}</div>
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
        `});c(p,`#modalCloseX`).onclick=()=>h();let g=c(p,`#shareStateBlock`),_=c(p,`#shareGenerateBtn`),v=c(p,`#shareSecondaryBtn`),y=c(p,`#shareCostToggle`),b=c(p,`#sharePlansToggle`),x=o,S=e=>`${window.location.origin}/share/${e}`,C=()=>{if(x){let e=S(x),t=i.shareViews||0;g.innerHTML=`
                <div style="background: rgba(255,255,255,0.96); color: #1d1d1f; padding: var(--space-3) var(--space-4); border-radius: 12px; word-break: break-all; font-family: ui-monospace, monospace; font-size: 0.82rem; font-weight: 600;">${l(e)}</div>
                <div style="display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 0.78rem; color: rgba(255,255,255,0.7); font-weight: 600;">
                    ${l(a(`share.viewsCount`,t,{count:t}))}
                </div>
            `,_.textContent=n(`share.copyBtn`),v.textContent=n(`share.unshareBtn`),v.style.display=``}else g.innerHTML=`
                <div style="padding: var(--space-3) var(--space-4); border-radius: 12px; background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.78); font-size: 0.85rem; text-align: center;">
                    ${l(n(`share.emptyState`))}
                </div>
            `,_.textContent=n(`share.generateBtn`),v.textContent=n(`share.closeBtn`)};C();let w=async()=>{if(x){let e=S(x);try{await navigator.clipboard.writeText(e),t(n(`share.linkCopied`),`success`)}catch{let r=document.createElement(`textarea`);r.value=e,document.body.appendChild(r),r.select();try{document.execCommand(`copy`)}catch{}document.body.removeChild(r),t(n(`share.linkCopied`),`success`)}return}_.disabled=!0,_.textContent=n(`share.generating`);try{let i=await r(`/api/trips/${encodeURIComponent(e.id)}/share`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({showCost:y.checked,showPlans:b.checked})});if(!i.ok)throw Error(`share HTTP ${i.status}`);let a=await i.json();x=a.token;let o=s.trips.find(t=>t.id===e.id)||s.archivedTrips.find(t=>t.id===e.id);o&&(o.shareToken=x,o.shareShowCost=!!a.showCost,o.shareShowPlans=!!a.showPlans,typeof o.shareViews!=`number`&&(o.shareViews=0)),m(`state:changed`),C();try{await navigator.clipboard.writeText(S(x))}catch{}t(n(`share.linkReady`),`success`)}catch(e){console.error(`Generate share link failed:`,e),t(n(`share.generateFailed`)),_.disabled=!1,C()}},T=async()=>{if(!x){h();return}v.disabled=!0,v.textContent=n(`share.unsharing`);try{let i=await r(`/api/trips/${encodeURIComponent(e.id)}/share`,{method:`DELETE`});if(!i.ok)throw Error(`unshare HTTP ${i.status}`);x=null;let a=s.trips.find(t=>t.id===e.id)||s.archivedTrips.find(t=>t.id===e.id);a&&(a.shareToken=null,a.shareShowCost=!1,a.shareShowPlans=!1),m(`state:changed`),C(),t(n(`share.linkRevoked`),`success`)}catch(e){console.error(`Unshare failed:`,e),t(n(`share.revokeFailed`))}finally{v.disabled=!1}},E=async(i,a)=>{if(x)try{let t=await r(`/api/trips/${encodeURIComponent(e.id)}/share`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({showCost:y.checked,showPlans:b.checked})});if(!t.ok)throw Error(`update HTTP ${t.status}`);let n=await t.json();x=n.token;let i=s.trips.find(t=>t.id===e.id)||s.archivedTrips.find(t=>t.id===e.id);i&&(i.shareToken=x,i.shareShowCost=!!n.showCost,i.shareShowPlans=!!n.showPlans),m(`state:changed`),C()}catch(e){console.error(`Toggle ${a} failed:`,e),i.checked=!i.checked,t(n(`share.toggleFailed`))}};y.addEventListener(`change`,()=>void E(y,`showCost`)),b.addEventListener(`change`,()=>void E(b,`showPlans`)),_.onclick=w,v.onclick=T};function v(e){let{trip:t,onShareToFeed:r,showFeedOption:i=!0}=e;if(!t)return;let{root:a,close:o}=d({variant:`glass`,cardStyle:`width: 420px; position: relative;`,innerHTML:`
            ${`
        <button type="button" id="modalCloseX" aria-label="${l(n(`share.closeAriaLabel`))}"
            style="position:absolute; top:14px; right:14px; width:32px; height:32px; border-radius:50%; background:rgba(0,0,0,0.18); border:0; color:#ffffff; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:1.1rem; line-height:1; padding:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `}
            <h2 class="card-title" style="font-size: var(--font-2xl); margin-bottom: var(--space-2); color: #ffffff; letter-spacing: -0.04em; font-weight: 800; text-align: center; padding-right: 32px; padding-left: 32px;">${l(n(`share.chooserTitle`,{name:t.name||`this trip`}))}</h2>
            <p class="mdl-subtitle-hero">
                ${l(n(`share.chooserSubtitle`))}
            </p>

            ${i?`
                <button type="button" id="shareChooserFeedBtn" style="display:flex; align-items:center; gap:14px; width:100%; padding:16px 18px; margin-bottom:12px; background:rgba(255,255,255,0.10); border:1px solid rgba(255,255,255,0.22); border-radius:14px; color:#ffffff; cursor:pointer; text-align:left;">
                    <span class="mdl-icon-1-6">📢</span>
                    <span class="flex-1-truncate">
                        <span class="mdl-field-label-block">${l(n(`share.chooserFeedTitle`))}</span>
                        <span class="mdl-field-sublabel">${l(n(`share.chooserFeedBody`))}</span>
                    </span>
                </button>
            `:``}

            <button type="button" id="shareChooserLinkBtn" style="display:flex; align-items:center; gap:14px; width:100%; padding:16px 18px; background:rgba(255,255,255,0.10); border:1px solid rgba(255,255,255,0.22); border-radius:14px; color:#ffffff; cursor:pointer; text-align:left;">
                <span class="mdl-icon-1-6">🔗</span>
                <span class="flex-1-truncate">
                    <span class="mdl-field-label-block">${l(n(`share.chooserLinkTitle`))}</span>
                    <span class="mdl-field-sublabel">${l(n(`share.chooserLinkBody`))}</span>
                </span>
            </button>

            <button type="button" id="shareChooserCancelBtn" class="btn-ghost" style="width:100%; margin-top:18px;">${l(n(`share.chooserCancel`))}</button>
        `});c(a,`#modalCloseX`).onclick=()=>o();let s=c(a,`#shareChooserFeedBtn`),u=c(a,`#shareChooserLinkBtn`),f=c(a,`#shareChooserCancelBtn`);s&&(s.onclick=()=>{o(),r()}),u.onclick=()=>{o(),_(t)},f.onclick=()=>o()}export{h as n,v as t};
//# sourceMappingURL=share-07YSK2e2.js.map