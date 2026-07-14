import{n as e}from"./rolldown-runtime-Kw0j5LDr.js";import{A as t,Dn as n,Nn as r,On as i,S as a,Sn as o,St as s,Xn as c,Yn as l,bn as u,w as d,wt as f}from"../app.bundle.js";var p=e=>{if(!e||!e.id){i(d(`modals.pdfErrorNoTrip`));return}let t=e.name||d(`feed.tripFallback`),{root:s,close:c}=u({innerHTML:`
        <div style="display:flex; flex-direction:column; text-align:left;">
            <!-- Gradient header strip — corners match the card's
                 border-radius so it sits flush with the modal's
                 top edge instead of being clipped by the card's
                 overflow:hidden + corner curve. -->
            <div style="display:flex; align-items:center; gap:14px; padding:18px 22px; background:linear-gradient(135deg, var(--accent-blue) 0%, #5856d6 100%); color:white; border-top-left-radius: var(--radius-3xl); border-top-right-radius: var(--radius-3xl);">
                <div style="width:44px; height:44px; border-radius:12px; background:rgba(255,255,255,0.18); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.28); display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;">${r(`document`,{size:22})}</div>
                <div style="flex:1; min-width:0;">
                    <h2 style="margin:0; font-size:1.15rem; color:white; font-weight:800; letter-spacing:-0.02em; line-height:1.15;">
                        ${o(d(`modals.pdfTitle`))}
                    </h2>
                    <p style="margin:3px 0 0; color:rgba(255,255,255,0.85); font-size:0.78rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        ${o(d(`modals.pdfSubtitlePrefix`))} <strong style="color:white;">${o(t)}</strong>
                    </p>
                </div>
            </div>
            <!-- Option grid — plain light cards. Auto-fit grid:
                 2 columns when there's room, single column on
                 narrow phones. -->
            <div id="pdfExportOptions" style="padding:18px 22px 0; display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:8px;">
                ${l(`includeCoverMap`,d(`modals.pdfOptCoverMap`),d(`modals.pdfOptCoverMapBody`))}
                ${l(`includeStats`,d(`modals.pdfOptSummary`),d(`modals.pdfOptSummaryBody`))}
                ${l(`includeDays`,d(`modals.pdfOptDayPlan`),d(`modals.pdfOptDayPlanBody`))}
                ${l(`includeDayPins`,d(`modals.pdfOptDayMaps`),d(`modals.pdfOptDayMapsBody`))}
                ${l(`includeTodos`,d(`modals.pdfOptTodo`),d(`modals.pdfOptTodoBody`))}
                ${l(`includeBudgets`,d(`modals.pdfOptBudgets`),d(`modals.pdfOptBudgetsBody`))}
                
                ${l(`includeExpenses`,d(`modals.pdfOptExpenses`),d(`modals.pdfOptExpensesBody`),!1)}
                ${l(`includeSettlements`,d(`modals.pdfOptSettlements`),d(`modals.pdfOptSettlementsBody`),!1)}
                ${l(`includePhotos`,d(`modals.pdfOptPhotos`),d(`modals.pdfOptPhotosBody`),!1)}
                ${l(`includeCompanions`,d(`modals.pdfOptCompanions`),d(`modals.pdfOptCompanionsBody`))}
                ${l(`includeMarkedPlaces`,d(`modals.pdfOptMarkedPlaces`),d(`modals.pdfOptMarkedPlacesBody`))}
            </div>
            <div style="display:flex; gap:10px; padding:18px 22px 22px;">
                <button type="button" id="cancelPdfBtn" class="flex-1"
                        style="font-weight:700; color:#002d5b; background:rgba(0,45,91,0.06); border:1px solid rgba(0,45,91,0.12); padding:11px 18px; border-radius:12px; cursor:pointer; font-size:0.9rem;">${o(d(`modals.pdfCancelBtn`))}</button>
                <button type="button" id="submitPdfBtn" class="flex-1"
                        style="background:linear-gradient(135deg, #34c759, #1a9947); border:0; color:white; padding:11px 18px; border-radius:12px; cursor:pointer; font-weight:800; font-size:0.9rem; box-shadow:0 4px 12px rgba(52,199,89,0.32);">
                    <span id="pdfBtnLabel">${o(d(`modals.pdfDownloadBtn`))}</span>
                </button>
            </div>
        </div>
    `,cardStyle:`max-width: 560px; width: min(560px, calc(100vw - 24px)); padding: 0; overflow: hidden; background: white;`});function l(e,t,n,r=!0){let i=!r,a=i?`background:rgba(0,45,91,0.03); border:1px dashed rgba(0,45,91,0.16);`:`background:rgba(0,113,227,0.04); border:1px solid rgba(0,113,227,0.10);`,s=i?`<span style="display:inline-block; margin-left:6px; padding:1px 6px; border-radius:999px; background:rgba(0,45,91,0.06); color:#4a5568; font-size:0.62rem; font-weight:700; letter-spacing:0.01em; vertical-align:middle; white-space:nowrap;">${o(d(`modals.pdfOptOffByDefault`))}</span>`:``;return`
            <label style="display:flex; align-items:flex-start; gap:8px; cursor:pointer; padding:10px 12px; border-radius:12px; transition: background 0.15s, border-color 0.15s; ${a}">
                <input type="checkbox" name="${e}" ${r?`checked`:``}
                       style="margin-top:2px; width:16px; height:16px; accent-color:var(--accent-blue); flex-shrink:0;">
                <span style="min-width:0; flex:1;">
                    <span style="display:block; font-weight:700; color:#002d5b; font-size:0.86rem; line-height:1.2;">${o(t)}${s}</span>
                    <span style="display:block; color:#4a5568; font-size:0.74rem; line-height:1.35; margin-top:2px;">${o(n)}</span>
                </span>
            </label>
        `}let p=n(s,`#cancelPdfBtn`),m=n(s,`#submitPdfBtn`),h=n(s,`#pdfBtnLabel`);p&&(p.onclick=()=>c()),m&&(m.onclick=async()=>{let t=s.querySelectorAll(`#pdfExportOptions input[type="checkbox"]`),n={};t.forEach(e=>{n[e.name]=e.checked}),n.locale=a(),m.disabled=!0,h&&(h.textContent=d(`modals.pdfStatusBuilding`));try{let t=await f(`/api/trips/${e.id}/pdf`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(n)});if(!t.ok){let e=``;try{let n=await t.json();n&&typeof n.error==`string`&&(e=n.error)}catch{}i(e||d(`modals.pdfErrorBuild`));return}let r=await t.blob(),a=URL.createObjectURL(r),o=navigator.userAgent||``,s=/iPad|iPhone|iPod/.test(o)||o.includes(`Mac`)&&`ontouchend`in document,l=(e.name||`trip`).replace(/[^A-Za-z0-9 _-]/g,`_`).trim()||`trip`;if(s)window.open(a,`_blank`)||(window.location.href=a),setTimeout(()=>URL.revokeObjectURL(a),6e4);else{let e=document.createElement(`a`);e.href=a,e.download=`${l}.pdf`,document.body.appendChild(e),e.click(),setTimeout(()=>{document.body.removeChild(e),URL.revokeObjectURL(a)},100)}c()}catch{i(d(`modals.pdfErrorNetwork`))}finally{m.disabled=!1,h&&(h.textContent=d(`modals.pdfDownloadBtn`))}})},m=e({importTripFromFile:()=>w,openDownloadChooserModal:()=>S}),h=e=>(e||`trip`).replace(/[^A-Za-z0-9 _-]/g,`_`).trim()||`trip`;function g(e,t){let n=URL.createObjectURL(e),r=navigator.userAgent||``;if(/iPad|iPhone|iPod/.test(r)||r.includes(`Mac`)&&`ontouchend`in document){window.open(n,`_blank`)||(window.location.href=n),setTimeout(()=>URL.revokeObjectURL(n),6e4);return}let i=document.createElement(`a`);i.href=n,i.download=t,document.body.appendChild(i),i.click(),setTimeout(()=>{document.body.removeChild(i),URL.revokeObjectURL(n)},100)}async function _(e){try{let t=await f(`/api/trips/${e.id}/export`);if(!t.ok){let e=``;try{let n=await t.json();n&&typeof n.error==`string`&&(e=n.error)}catch{}return i(e||d(`modals.downloadZipError`)),!1}return g(await t.blob(),`${h(e.name)}.ggtrip.zip`),!0}catch{return i(d(`modals.downloadZipError`)),!1}}var v=`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="11" x2="12" y2="11"/></svg>`,y=`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`,b=`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.32; flex-shrink:0;"><polyline points="9 18 15 12 9 6"/></svg>`;function x(e,t,n,r,i){return`
        <button type="button" id="${e}" style="display:flex; align-items:center; gap:14px; width:100%; text-align:left; padding:14px 16px; border-radius:16px; border:1px solid rgba(0,0,0,0.08); background:#fff; cursor:pointer; transition:border-color 0.15s, box-shadow 0.15s, transform 0.1s;"
            onmouseover="this.style.borderColor='rgba(${t},0.5)'; this.style.boxShadow='0 4px 16px rgba(${t},0.14)';"
            onmouseout="this.style.borderColor='rgba(0,0,0,0.08)'; this.style.boxShadow='none';">
            <span style="width:44px; height:44px; border-radius:12px; background:rgba(${t},0.12); color:rgb(${t}); display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;">${n}</span>
            <span style="flex:1; min-width:0;">
                <span style="display:block; font-weight:700; color:#1d1d1f; font-size:0.95rem; line-height:1.2;">${r}</span>
                <span data-sub="1" style="display:block; color:#6b7280; font-size:0.78rem; line-height:1.35; margin-top:2px;">${i}</span>
            </span>
            ${b}
        </button>`}var S=e=>{if(!e||!e.id){i(d(`modals.pdfErrorNoTrip`));return}let{root:t,close:n}=u({innerHTML:`
        <div style="text-align:left;">
            <h2 style="margin:0 0 2px; font-size:1.15rem; font-weight:800; letter-spacing:-0.02em; color:#1d1d1f;">${d(`modals.downloadChooserTitle`)}</h2>
            <p style="margin:0 0 16px; color:#6b7280; font-size:0.82rem; font-weight:500;">${d(`modals.downloadChooserSubtitle`)}</p>
            <div style="display:flex; flex-direction:column; gap:10px;">
                ${x(`chooserPdfBtn`,`52,199,89`,v,d(`modals.downloadPdfOption`),d(`modals.downloadPdfOptionBody`))}
                ${x(`chooserZipBtn`,`0,113,227`,y,d(`modals.downloadZipOption`),d(`modals.downloadZipOptionBodyV2`))}
            </div>
            <button type="button" id="chooserCancelBtn" style="width:100%; margin-top:14px; font-weight:700; color:#1d1d1f; background:rgba(0,0,0,0.05); border:0; padding:11px 18px; border-radius:12px; cursor:pointer; font-size:0.88rem;">${d(`modals.downloadChooserCancel`)}</button>
        </div>`,cardStyle:`max-width: 420px; width: min(420px, calc(100vw - 24px)); background:#fff;`}),r=t.querySelector(`#chooserPdfBtn`),a=t.querySelector(`#chooserZipBtn`),o=t.querySelector(`#chooserCancelBtn`);if(o&&(o.onclick=()=>n()),r&&(r.onclick=()=>{n(),p(e)}),a){let t=a.querySelector(`[data-sub]`);a.onclick=async()=>{if(a.disabled=!0,r&&(r.disabled=!0),t&&(t.textContent=d(`modals.downloadZipStatus`)),await _(e)){n();return}a.disabled=!1,r&&(r.disabled=!1),t&&(t.textContent=d(`modals.downloadZipOptionBodyV2`))}}},C=64*1024*1024;async function w(e){if(e.size&&e.size>C)return{ok:!1,error:d(`modals.importTripTooLarge`)};let n=new FormData;n.append(`file`,e);let r;try{r=await f(`/api/trips/import`,{method:`POST`,body:n})}catch{return{ok:!1,error:d(`modals.importTripError`)}}if(!r.ok){let e=``;try{let t=await r.json();t&&typeof t.error==`string`&&(e=t.error)}catch{}return{ok:!1,error:e||d(`modals.importTripError`)}}let i={};try{i=await r.json()}catch{}return i.tripId?(await t(),l.activeTripId=i.tripId,await s(i.tripId),c(`state:changed`),{ok:!0}):{ok:!1,error:d(`modals.importTripError`)}}export{p as i,S as n,m as r,w as t};
//# sourceMappingURL=tripExport-BKD0Icz8.js.map