import{n as e}from"./rolldown-runtime-Kw0j5LDr.js";import{$t as t,En as n,O as r,S as i,Tn as a,b as o,bt as s,in as c,ln as l,tn as u,un as d}from"../app.bundle.js";var f=e=>{if(!e||!e.id){d(i(`modals.pdfErrorNoTrip`));return}let n=e.name||i(`feed.tripFallback`),{root:r,close:a}=t({innerHTML:`
        <div style="display:flex; flex-direction:column; text-align:left;">
            <!-- Gradient header strip — corners match the card's
                 border-radius so it sits flush with the modal's
                 top edge instead of being clipped by the card's
                 overflow:hidden + corner curve. -->
            <div style="display:flex; align-items:center; gap:14px; padding:18px 22px; background:linear-gradient(135deg, var(--accent-blue) 0%, #5856d6 100%); color:white; border-top-left-radius: var(--radius-3xl); border-top-right-radius: var(--radius-3xl);">
                <div style="width:44px; height:44px; border-radius:12px; background:rgba(255,255,255,0.18); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.28); display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;">${u(`document`,{size:22})}</div>
                <div style="flex:1; min-width:0;">
                    <h2 style="margin:0; font-size:1.15rem; color:white; font-weight:800; letter-spacing:-0.02em; line-height:1.15;">
                        ${c(i(`modals.pdfTitle`))}
                    </h2>
                    <p style="margin:3px 0 0; color:rgba(255,255,255,0.85); font-size:0.78rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        ${c(i(`modals.pdfSubtitlePrefix`))} <strong style="color:white;">${c(n)}</strong>
                    </p>
                </div>
            </div>
            <!-- Option grid — plain light cards. Auto-fit grid:
                 2 columns when there's room, single column on
                 narrow phones. -->
            <div id="pdfExportOptions" style="padding:18px 22px 0; display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:8px;">
                ${f(`includeCoverMap`,i(`modals.pdfOptCoverMap`),i(`modals.pdfOptCoverMapBody`))}
                ${f(`includeStats`,i(`modals.pdfOptSummary`),i(`modals.pdfOptSummaryBody`))}
                ${f(`includeDays`,i(`modals.pdfOptDayPlan`),i(`modals.pdfOptDayPlanBody`))}
                ${f(`includeDayPins`,i(`modals.pdfOptDayMaps`),i(`modals.pdfOptDayMapsBody`))}
                ${f(`includeTodos`,i(`modals.pdfOptTodo`),i(`modals.pdfOptTodoBody`))}
                ${f(`includeBudgets`,i(`modals.pdfOptBudgets`),i(`modals.pdfOptBudgetsBody`))}
                
                ${f(`includeExpenses`,i(`modals.pdfOptExpenses`),i(`modals.pdfOptExpensesBody`),!1)}
                ${f(`includeSettlements`,i(`modals.pdfOptSettlements`),i(`modals.pdfOptSettlementsBody`),!1)}
                ${f(`includePhotos`,i(`modals.pdfOptPhotos`),i(`modals.pdfOptPhotosBody`),!1)}
                ${f(`includeCompanions`,i(`modals.pdfOptCompanions`),i(`modals.pdfOptCompanionsBody`))}
                ${f(`includeMarkedPlaces`,i(`modals.pdfOptMarkedPlaces`),i(`modals.pdfOptMarkedPlacesBody`))}
            </div>
            <div style="display:flex; gap:10px; padding:18px 22px 22px;">
                <button type="button" id="cancelPdfBtn" class="flex-1"
                        style="font-weight:700; color:#002d5b; background:rgba(0,45,91,0.06); border:1px solid rgba(0,45,91,0.12); padding:11px 18px; border-radius:12px; cursor:pointer; font-size:0.9rem;">${c(i(`modals.pdfCancelBtn`))}</button>
                <button type="button" id="submitPdfBtn" class="flex-1"
                        style="background:linear-gradient(135deg, #34c759, #1a9947); border:0; color:white; padding:11px 18px; border-radius:12px; cursor:pointer; font-weight:800; font-size:0.9rem; box-shadow:0 4px 12px rgba(52,199,89,0.32);">
                    <span id="pdfBtnLabel">${c(i(`modals.pdfDownloadBtn`))}</span>
                </button>
            </div>
        </div>
    `,cardStyle:`max-width: 560px; width: min(560px, calc(100vw - 24px)); padding: 0; overflow: hidden; background: white;`});function f(e,t,n,r=!0){return`
            <label style="display:flex; align-items:flex-start; gap:8px; cursor:pointer; padding:10px 12px; border-radius:12px; transition: background 0.15s, border-color 0.15s; background:rgba(0,113,227,0.04); border:1px solid rgba(0,113,227,0.10);">
                <input type="checkbox" name="${e}" ${r?`checked`:``}
                       style="margin-top:2px; width:16px; height:16px; accent-color:var(--accent-blue); flex-shrink:0;">
                <span style="min-width:0; flex:1;">
                    <span style="display:block; font-weight:700; color:#002d5b; font-size:0.86rem; line-height:1.2;">${c(t)}</span>
                    <span style="display:block; color:#4a5568; font-size:0.74rem; line-height:1.35; margin-top:2px;">${c(n)}</span>
                </span>
            </label>
        `}let p=l(r,`#cancelPdfBtn`),m=l(r,`#submitPdfBtn`),h=l(r,`#pdfBtnLabel`);p&&(p.onclick=()=>a()),m&&(m.onclick=async()=>{let t=r.querySelectorAll(`#pdfExportOptions input[type="checkbox"]`),n={};t.forEach(e=>{n[e.name]=e.checked}),n.locale=o(),m.disabled=!0,h&&(h.textContent=i(`modals.pdfStatusBuilding`));try{let t=await s(`/api/trips/${e.id}/pdf`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(n)});if(!t.ok){let e=``;try{let n=await t.json();n&&typeof n.error==`string`&&(e=n.error)}catch{}d(e||i(`modals.pdfErrorBuild`));return}let r=await t.blob(),o=URL.createObjectURL(r),c=navigator.userAgent||``,l=/iPad|iPhone|iPod/.test(c)||c.includes(`Mac`)&&`ontouchend`in document,u=(e.name||`trip`).replace(/[^A-Za-z0-9 _-]/g,`_`).trim()||`trip`;if(l)window.open(o,`_blank`)||(window.location.href=o),setTimeout(()=>URL.revokeObjectURL(o),6e4);else{let e=document.createElement(`a`);e.href=o,e.download=`${u}.pdf`,document.body.appendChild(e),e.click(),setTimeout(()=>{document.body.removeChild(e),URL.revokeObjectURL(o)},100)}a()}catch{d(i(`modals.pdfErrorNetwork`))}finally{m.disabled=!1,h&&(h.textContent=i(`modals.pdfDownloadBtn`))}})},p=e({importTripFromFile:()=>C,openDownloadChooserModal:()=>x}),m=e=>(e||`trip`).replace(/[^A-Za-z0-9 _-]/g,`_`).trim()||`trip`;function h(e,t){let n=URL.createObjectURL(e),r=navigator.userAgent||``;if(/iPad|iPhone|iPod/.test(r)||r.includes(`Mac`)&&`ontouchend`in document){window.open(n,`_blank`)||(window.location.href=n),setTimeout(()=>URL.revokeObjectURL(n),6e4);return}let i=document.createElement(`a`);i.href=n,i.download=t,document.body.appendChild(i),i.click(),setTimeout(()=>{document.body.removeChild(i),URL.revokeObjectURL(n)},100)}async function g(e){try{let t=await s(`/api/trips/${e.id}/export`);if(!t.ok){let e=``;try{let n=await t.json();n&&typeof n.error==`string`&&(e=n.error)}catch{}return d(e||i(`modals.downloadZipError`)),!1}return h(await t.blob(),`${m(e.name)}.ggtrip.zip`),!0}catch{return d(i(`modals.downloadZipError`)),!1}}var _=`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="11" x2="12" y2="11"/></svg>`,v=`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`,y=`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.32; flex-shrink:0;"><polyline points="9 18 15 12 9 6"/></svg>`;function b(e,t,n,r,i){return`
        <button type="button" id="${e}" style="display:flex; align-items:center; gap:14px; width:100%; text-align:left; padding:14px 16px; border-radius:16px; border:1px solid rgba(0,0,0,0.08); background:#fff; cursor:pointer; transition:border-color 0.15s, box-shadow 0.15s, transform 0.1s;"
            onmouseover="this.style.borderColor='rgba(${t},0.5)'; this.style.boxShadow='0 4px 16px rgba(${t},0.14)';"
            onmouseout="this.style.borderColor='rgba(0,0,0,0.08)'; this.style.boxShadow='none';">
            <span style="width:44px; height:44px; border-radius:12px; background:rgba(${t},0.12); color:rgb(${t}); display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;">${n}</span>
            <span style="flex:1; min-width:0;">
                <span style="display:block; font-weight:700; color:#1d1d1f; font-size:0.95rem; line-height:1.2;">${r}</span>
                <span data-sub="1" style="display:block; color:#6b7280; font-size:0.78rem; line-height:1.35; margin-top:2px;">${i}</span>
            </span>
            ${y}
        </button>`}var x=e=>{if(!e||!e.id){d(i(`modals.pdfErrorNoTrip`));return}let{root:n,close:r}=t({innerHTML:`
        <div style="text-align:left;">
            <h2 style="margin:0 0 2px; font-size:1.15rem; font-weight:800; letter-spacing:-0.02em; color:#1d1d1f;">${i(`modals.downloadChooserTitle`)}</h2>
            <p style="margin:0 0 16px; color:#6b7280; font-size:0.82rem; font-weight:500;">${i(`modals.downloadChooserSubtitle`)}</p>
            <div style="display:flex; flex-direction:column; gap:10px;">
                ${b(`chooserPdfBtn`,`52,199,89`,_,i(`modals.downloadPdfOption`),i(`modals.downloadPdfOptionBody`))}
                ${b(`chooserZipBtn`,`0,113,227`,v,i(`modals.downloadZipOption`),i(`modals.downloadZipOptionBody`))}
            </div>
            <button type="button" id="chooserCancelBtn" style="width:100%; margin-top:14px; font-weight:700; color:#1d1d1f; background:rgba(0,0,0,0.05); border:0; padding:11px 18px; border-radius:12px; cursor:pointer; font-size:0.88rem;">${i(`modals.downloadChooserCancel`)}</button>
        </div>`,cardStyle:`max-width: 420px; width: min(420px, calc(100vw - 24px)); background:#fff;`}),a=n.querySelector(`#chooserPdfBtn`),o=n.querySelector(`#chooserZipBtn`),s=n.querySelector(`#chooserCancelBtn`);if(s&&(s.onclick=()=>r()),a&&(a.onclick=()=>{r(),f(e)}),o){let t=o.querySelector(`[data-sub]`);o.onclick=async()=>{if(o.disabled=!0,a&&(a.disabled=!0),t&&(t.textContent=i(`modals.downloadZipStatus`)),await g(e)){r();return}o.disabled=!1,a&&(a.disabled=!1),t&&(t.textContent=i(`modals.downloadZipOptionBody`))}}},S=256*1024*1024;async function C(e){if(e.size&&e.size>S)return{ok:!1,error:i(`modals.importTripTooLarge`)};let t=new FormData;t.append(`file`,e);let o;try{o=await s(`/api/trips/import`,{method:`POST`,body:t})}catch{return{ok:!1,error:i(`modals.importTripError`)}}if(!o.ok){let e=``;try{let t=await o.json();t&&typeof t.error==`string`&&(e=t.error)}catch{}return{ok:!1,error:e||i(`modals.importTripError`)}}let c={};try{c=await o.json()}catch{}return c.tripId?(await r(),a.activeTripId=c.tripId,n(`state:changed`),{ok:!0}):{ok:!1,error:i(`modals.importTripError`)}}export{p as n,C as t};
//# sourceMappingURL=tripExport-CKWhtoRT.js.map