import{n as e}from"./rolldown-runtime-Kw0j5LDr.js";import{A as t,An as n,En as r,Kn as i,S as a,Sn as o,St as s,jn as c,qn as l,w as u,wn as d,wt as f}from"../app.bundle.js";var p=e=>{if(!e||!e.id){c(u(`modals.pdfErrorNoTrip`));return}let t=e.name||u(`feed.tripFallback`),{root:i,close:s}=o({innerHTML:`
        <div style="display:flex; flex-direction:column; text-align:left;">
            <!-- Gradient header strip — corners match the card's
                 border-radius so it sits flush with the modal's
                 top edge instead of being clipped by the card's
                 overflow:hidden + corner curve. -->
            <div style="display:flex; align-items:center; gap:14px; padding:18px 22px; background:linear-gradient(135deg, var(--accent-blue) 0%, #5856d6 100%); color:white; border-top-left-radius: var(--radius-3xl); border-top-right-radius: var(--radius-3xl);">
                <div style="width:44px; height:44px; border-radius:12px; background:rgba(255,255,255,0.18); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.28); display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;">${d(`document`,{size:22})}</div>
                <div style="flex:1; min-width:0;">
                    <h2 style="margin:0; font-size:1.15rem; color:white; font-weight:800; letter-spacing:-0.02em; line-height:1.15;">
                        ${r(u(`modals.pdfTitle`))}
                    </h2>
                    <p style="margin:3px 0 0; color:rgba(255,255,255,0.85); font-size:0.78rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        ${r(u(`modals.pdfSubtitlePrefix`))} <strong style="color:white;">${r(t)}</strong>
                    </p>
                </div>
            </div>
            <!-- Option grid — plain light cards. Auto-fit grid:
                 2 columns when there's room, single column on
                 narrow phones. -->
            <div id="pdfExportOptions" style="padding:18px 22px 0; display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:8px;">
                ${l(`includeCoverMap`,u(`modals.pdfOptCoverMap`),u(`modals.pdfOptCoverMapBody`))}
                ${l(`includeStats`,u(`modals.pdfOptSummary`),u(`modals.pdfOptSummaryBody`))}
                ${l(`includeDays`,u(`modals.pdfOptDayPlan`),u(`modals.pdfOptDayPlanBody`))}
                ${l(`includeDayPins`,u(`modals.pdfOptDayMaps`),u(`modals.pdfOptDayMapsBody`))}
                ${l(`includeTodos`,u(`modals.pdfOptTodo`),u(`modals.pdfOptTodoBody`))}
                ${l(`includeBudgets`,u(`modals.pdfOptBudgets`),u(`modals.pdfOptBudgetsBody`))}
                
                ${l(`includeExpenses`,u(`modals.pdfOptExpenses`),u(`modals.pdfOptExpensesBody`),!1)}
                ${l(`includeSettlements`,u(`modals.pdfOptSettlements`),u(`modals.pdfOptSettlementsBody`),!1)}
                ${l(`includePhotos`,u(`modals.pdfOptPhotos`),u(`modals.pdfOptPhotosBody`),!1)}
                ${l(`includeCompanions`,u(`modals.pdfOptCompanions`),u(`modals.pdfOptCompanionsBody`))}
                ${l(`includeMarkedPlaces`,u(`modals.pdfOptMarkedPlaces`),u(`modals.pdfOptMarkedPlacesBody`))}
            </div>
            <div style="display:flex; gap:10px; padding:18px 22px 22px;">
                <button type="button" id="cancelPdfBtn" class="flex-1"
                        style="font-weight:700; color:#002d5b; background:rgba(0,45,91,0.06); border:1px solid rgba(0,45,91,0.12); padding:11px 18px; border-radius:12px; cursor:pointer; font-size:0.9rem;">${r(u(`modals.pdfCancelBtn`))}</button>
                <button type="button" id="submitPdfBtn" class="flex-1"
                        style="background:linear-gradient(135deg, #34c759, #1a9947); border:0; color:white; padding:11px 18px; border-radius:12px; cursor:pointer; font-weight:800; font-size:0.9rem; box-shadow:0 4px 12px rgba(52,199,89,0.32);">
                    <span id="pdfBtnLabel">${r(u(`modals.pdfDownloadBtn`))}</span>
                </button>
            </div>
        </div>
    `,cardStyle:`max-width: 560px; width: min(560px, calc(100vw - 24px)); padding: 0; overflow: hidden; background: white;`});function l(e,t,n,i=!0){let a=!i,o=a?`background:rgba(0,45,91,0.03); border:1px dashed rgba(0,45,91,0.16);`:`background:rgba(0,113,227,0.04); border:1px solid rgba(0,113,227,0.10);`,s=a?`<span style="display:inline-block; margin-left:6px; padding:1px 6px; border-radius:999px; background:rgba(0,45,91,0.06); color:#4a5568; font-size:0.62rem; font-weight:700; letter-spacing:0.01em; vertical-align:middle; white-space:nowrap;">${r(u(`modals.pdfOptOffByDefault`))}</span>`:``;return`
            <label style="display:flex; align-items:flex-start; gap:8px; cursor:pointer; padding:10px 12px; border-radius:12px; transition: background 0.15s, border-color 0.15s; ${o}">
                <input type="checkbox" name="${e}" ${i?`checked`:``}
                       style="margin-top:2px; width:16px; height:16px; accent-color:var(--accent-blue); flex-shrink:0;">
                <span style="min-width:0; flex:1;">
                    <span style="display:block; font-weight:700; color:#002d5b; font-size:0.86rem; line-height:1.2;">${r(t)}${s}</span>
                    <span style="display:block; color:#4a5568; font-size:0.74rem; line-height:1.35; margin-top:2px;">${r(n)}</span>
                </span>
            </label>
        `}let p=n(i,`#cancelPdfBtn`),m=n(i,`#submitPdfBtn`),h=n(i,`#pdfBtnLabel`);p&&(p.onclick=()=>s()),m&&(m.onclick=async()=>{let t=i.querySelectorAll(`#pdfExportOptions input[type="checkbox"]`),n={};t.forEach(e=>{n[e.name]=e.checked}),n.locale=a(),m.disabled=!0,h&&(h.textContent=u(`modals.pdfStatusBuilding`));try{let t=await f(`/api/trips/${e.id}/pdf`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(n)});if(!t.ok){let e=``;try{let n=await t.json();n&&typeof n.error==`string`&&(e=n.error)}catch{}c(e||u(`modals.pdfErrorBuild`));return}let r=await t.blob(),i=URL.createObjectURL(r),a=navigator.userAgent||``,o=/iPad|iPhone|iPod/.test(a)||a.includes(`Mac`)&&`ontouchend`in document,l=(e.name||`trip`).replace(/[^A-Za-z0-9 _-]/g,`_`).trim()||`trip`;if(o)window.open(i,`_blank`)||(window.location.href=i),setTimeout(()=>URL.revokeObjectURL(i),6e4);else{let e=document.createElement(`a`);e.href=i,e.download=`${l}.pdf`,document.body.appendChild(e),e.click(),setTimeout(()=>{document.body.removeChild(e),URL.revokeObjectURL(i)},100)}s()}catch{c(u(`modals.pdfErrorNetwork`))}finally{m.disabled=!1,h&&(h.textContent=u(`modals.pdfDownloadBtn`))}})},m=e({importTripFromFile:()=>w,openDownloadChooserModal:()=>S}),h=e=>(e||`trip`).replace(/[^A-Za-z0-9 _-]/g,`_`).trim()||`trip`;function g(e,t){let n=URL.createObjectURL(e),r=navigator.userAgent||``;if(/iPad|iPhone|iPod/.test(r)||r.includes(`Mac`)&&`ontouchend`in document){window.open(n,`_blank`)||(window.location.href=n),setTimeout(()=>URL.revokeObjectURL(n),6e4);return}let i=document.createElement(`a`);i.href=n,i.download=t,document.body.appendChild(i),i.click(),setTimeout(()=>{document.body.removeChild(i),URL.revokeObjectURL(n)},100)}async function _(e){try{let t=await f(`/api/trips/${e.id}/export`);if(!t.ok){let e=``;try{let n=await t.json();n&&typeof n.error==`string`&&(e=n.error)}catch{}return c(e||u(`modals.downloadZipError`)),!1}return g(await t.blob(),`${h(e.name)}.ggtrip.zip`),!0}catch{return c(u(`modals.downloadZipError`)),!1}}var v=`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="11" x2="12" y2="11"/></svg>`,y=`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`,b=`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.32; flex-shrink:0;"><polyline points="9 18 15 12 9 6"/></svg>`;function x(e,t,n,r,i){return`
        <button type="button" id="${e}" style="display:flex; align-items:center; gap:14px; width:100%; text-align:left; padding:14px 16px; border-radius:16px; border:1px solid rgba(0,0,0,0.08); background:#fff; cursor:pointer; transition:border-color 0.15s, box-shadow 0.15s, transform 0.1s;"
            onmouseover="this.style.borderColor='rgba(${t},0.5)'; this.style.boxShadow='0 4px 16px rgba(${t},0.14)';"
            onmouseout="this.style.borderColor='rgba(0,0,0,0.08)'; this.style.boxShadow='none';">
            <span style="width:44px; height:44px; border-radius:12px; background:rgba(${t},0.12); color:rgb(${t}); display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;">${n}</span>
            <span style="flex:1; min-width:0;">
                <span style="display:block; font-weight:700; color:#1d1d1f; font-size:0.95rem; line-height:1.2;">${r}</span>
                <span data-sub="1" style="display:block; color:#6b7280; font-size:0.78rem; line-height:1.35; margin-top:2px;">${i}</span>
            </span>
            ${b}
        </button>`}var S=e=>{if(!e||!e.id){c(u(`modals.pdfErrorNoTrip`));return}let{root:t,close:n}=o({innerHTML:`
        <div style="text-align:left;">
            <h2 style="margin:0 0 2px; font-size:1.15rem; font-weight:800; letter-spacing:-0.02em; color:#1d1d1f;">${u(`modals.downloadChooserTitle`)}</h2>
            <p style="margin:0 0 16px; color:#6b7280; font-size:0.82rem; font-weight:500;">${u(`modals.downloadChooserSubtitle`)}</p>
            <div style="display:flex; flex-direction:column; gap:10px;">
                ${x(`chooserPdfBtn`,`52,199,89`,v,u(`modals.downloadPdfOption`),u(`modals.downloadPdfOptionBody`))}
                ${x(`chooserZipBtn`,`0,113,227`,y,u(`modals.downloadZipOption`),u(`modals.downloadZipOptionBodyV2`))}
            </div>
            <button type="button" id="chooserCancelBtn" style="width:100%; margin-top:14px; font-weight:700; color:#1d1d1f; background:rgba(0,0,0,0.05); border:0; padding:11px 18px; border-radius:12px; cursor:pointer; font-size:0.88rem;">${u(`modals.downloadChooserCancel`)}</button>
        </div>`,cardStyle:`max-width: 420px; width: min(420px, calc(100vw - 24px)); background:#fff;`}),r=t.querySelector(`#chooserPdfBtn`),i=t.querySelector(`#chooserZipBtn`),a=t.querySelector(`#chooserCancelBtn`);if(a&&(a.onclick=()=>n()),r&&(r.onclick=()=>{n(),p(e)}),i){let t=i.querySelector(`[data-sub]`);i.onclick=async()=>{if(i.disabled=!0,r&&(r.disabled=!0),t&&(t.textContent=u(`modals.downloadZipStatus`)),await _(e)){n();return}i.disabled=!1,r&&(r.disabled=!1),t&&(t.textContent=u(`modals.downloadZipOptionBodyV2`))}}},C=64*1024*1024;async function w(e){if(e.size&&e.size>C)return{ok:!1,error:u(`modals.importTripTooLarge`)};let n=new FormData;n.append(`file`,e);let r;try{r=await f(`/api/trips/import`,{method:`POST`,body:n})}catch{return{ok:!1,error:u(`modals.importTripError`)}}if(!r.ok){let e=``;try{let t=await r.json();t&&typeof t.error==`string`&&(e=t.error)}catch{}return{ok:!1,error:e||u(`modals.importTripError`)}}let a={};try{a=await r.json()}catch{}return a.tripId?(await t(),i.activeTripId=a.tripId,await s(a.tripId),l(`state:changed`),{ok:!0}):{ok:!1,error:u(`modals.importTripError`)}}export{p as i,S as n,m as r,w as t};
//# sourceMappingURL=tripExport-Cj2UYv10.js.map