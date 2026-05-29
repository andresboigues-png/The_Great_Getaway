import{Bt as e,Gt as t,S as n,en as r,x as i,zt as a}from"../app.bundle.js";import{r as o,t as s}from"./icons-Df16OBO6.js";var c=(e,t)=>`<span style="display:inline-flex;align-items:center;gap:6px;justify-content:center">${s(e)}${a(o(t))}</span>`,l=`home_path_card_collapsed_day_ids`;function u(){try{let e=localStorage.getItem(l);if(!e)return new Set;let t=JSON.parse(e);return new Set(Array.isArray(t)?t:[])}catch{return new Set}}function d(e){try{localStorage.setItem(l,JSON.stringify([...e]))}catch{}}function f(e){let t=u();return t.has(e)?(t.delete(e),d(t),!1):(t.add(e),d(t),!0)}function p(e){return u().has(e)}function m(e,t){let n=u(),r=n.has(e);t&&!r?(n.add(e),d(n)):!t&&r&&(n.delete(e),d(n))}function h(n,r,c){let{isAnchor:l,isSelected:u}=r,d=l?`<div style="background: var(--gradient-anchor-deep); color: white; width: 48px; height: 48px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(212,160,23,0.28);">
               <!-- 2026-05-21: replaced the anchor glyph with a 5-point
                    star to match the Trip Anchor → Trip Hub rename. -->
               <svg width="26" height="26" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">
                   <polygon points="12 2 15 8.5 22 9.3 17 14.3 18.2 21.3 12 18 5.8 21.3 7 14.3 2 9.3 9 8.5"/>
               </svg>
           </div>`:`<div style="background: var(--gradient-title); color: white; width: 48px; height: 48px; border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(0,113,227,0.15);">
               <span style="font-size: 0.6rem; font-weight: 800; text-transform: uppercase; opacity: 0.85; letter-spacing: 0.05em; line-height:1;">${a(i(`pathTab.dayBadgeLabel`))}</span>
               <span style="font-size: 1.25rem; font-weight: 800; line-height: 1.05;">${n.dayNumber}</span>
           </div>`,f=l?i(`pathTab.hubTitle`):a(n.name||i(`tripMedia.dayBucketDay`,{n:n.dayNumber})),p=[];if(l){p.push(c&&c.country?a(t(c.country)):a(i(`pathTab.hubSubtitleFallback`)));let e=(c.documents||[]).filter(e=>e.dayId===n.id),r=(c.photos||[]).filter(e=>e.dayId===n.id),o=e.length+(n.tickets||[]).length,l=r.length+(n.photos||[]).length;l&&p.push(`<span style="display:inline-flex; align-items:center; gap:4px; background:rgba(52,199,89,0.12); color:#1a6b3c; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:800;">${s(`photo`,{size:13})}${l}</span>`),o&&p.push(`<span style="display:inline-flex; align-items:center; gap:4px; background:rgba(88,86,214,0.12); color:#5856d6; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:800;">${s(`document`,{size:13})}${o}</span>`)}else p.push(`<span style="display:inline-flex; align-items:center; gap:5px;">${s(`calendar`,{size:14})}${e(n.date)||i(`pathTab.setDatePlaceholder`)}</span>`),n.lat?p.push(`<span style="color: #005bb8;">${a(i(`pathTab.locationSet`))}</span>`):p.push(`<span class="day-card__pin-hint" style="display:inline-flex; align-items:center; gap:4px;">${s(`pinned`,{size:13})}${a(o(i(`pathTab.pinThisDay`)))}</span>`),n.date&&p.push(`<span class="day-card__weather" data-weather-date="${a(n.date)}"></span>`);let m=u&&n.notes&&!l?`
        <div style="margin-top: 12px; padding: 12px 14px; background: rgba(0,113,227,0.04); border-radius: 14px; border-left: 3px solid var(--accent-blue);">
            <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: #005bb8; margin-bottom: 4px; letter-spacing: 0.05em;">${a(i(`pathTab.journalPreviewLabel`))}</div>
            <p style="margin: 0; font-size: 0.9rem; line-height: 1.45; color: #002d5b; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${a(n.notes)}</p>
        </div>
    `:``,h=`
        <button type="button" class="path-card-collapse-btn" data-day-id="${a(n.id)}"
            aria-label="${a(i(`pathTab.toggleOptionsAria`,{title:f}))}" title="${a(i(`pathTab.toggleOptionsTitle`))}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="6 15 12 9 18 15"></polyline>
            </svg>
        </button>
    `;return`
        <div style="display:flex; align-items:center; gap:14px;">
            ${d}
            <div style="flex:1; min-width:0;">
                <h3 style="margin:0; font-size:${l?`1.05rem`:`1.25rem`}; font-weight:800; color:var(--text-brand-navy); letter-spacing:-0.02em; line-height:1.2; ${l?`overflow:hidden; text-overflow:ellipsis; white-space:nowrap;`:``}">${f}</h3>
                <div style="font-size:0.82rem; color:var(--text-secondary); font-weight:600; margin-top:4px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    ${p.map(e=>`<span>${e}</span>`).join(`<span style="opacity:0.4;">·</span>`)}
                </div>
            </div>
            ${h}
        </div>
        ${m}
    `}function g(e,t,n,r){if(!e||!n)return``;let{isAnchor:o}=t,s=[];if(o?s.push(`<button class="path-primary-btn path-primary-btn--anchor path-checklist-btn" data-day-id="${a(e.id)}">${c(`checklist`,i(`pathTab.btnChecklist`))}</button>`):s.push(`<button class="path-primary-btn day-detail-btn" data-day-id="${a(e.id)}">${c(`plan`,i(`pathTab.btnOpenFullPlan`))}</button>`),r===e.id)s.push(`<button class="day-action-btn day-action-btn--success day-pin-save-btn" data-day-id="${a(e.id)}">${a(i(`pathTab.btnSavePin`))}</button>`),s.push(`<button class="day-action-btn day-action-btn--danger-fill day-pin-delete-btn" data-day-id="${a(e.id)}">${a(i(`pathTab.btnCancelPinEdit`))}</button>`);else{let t=e.lat?i(o?`pathTab.btnEditAnchorPin`:`pathTab.btnEditPin`):i(o?`pathTab.btnSetAnchorPin`:`pathTab.btnAddPin`);s.push(`<button class="day-action-btn day-action-btn--neutral day-pin-toggle-btn" data-day-id="${a(e.id)}">${c(`pin`,t)}</button>`)}return o?(s.push(`<button class="day-action-btn day-action-btn--neutral path-documents-btn" data-day-id="${a(e.id)}">${c(`document`,i(`pathTab.btnDocuments`))}</button>`),s.push(`<button class="day-action-btn day-action-btn--neutral path-photos-btn" data-day-id="${a(e.id)}">${c(`photo`,i(`pathTab.btnPhotos`))}</button>`)):(s.push(`<button class="day-action-btn day-action-btn--neutral day-journaling-btn" data-day-id="${a(e.id)}">${c(`journal`,i(`pathTab.btnJournaling`))}</button>`),s.push(`<button class="day-action-btn day-action-btn--danger day-delete-btn" data-day-id="${a(e.id)}">${c(`trash`,i(`pathTab.btnDeleteDay`))}</button>`)),`<div class="path-options-stack">${s.join(``)}</div>`}function _(t){let{activeTrip:r,tripDays:o,tripIsEditable:s,editingDayId:c}=t,l=[...o].sort((e,t)=>e.dayNumber-t.dayNumber),u=l.find(e=>e.dayNumber===0)||null,d=l.filter(e=>e.dayNumber>0),f=w(r,l),m=l.find(e=>e.id===f)||null;if(l.length===0)return`<div class="card glass" style="padding:28px; border-radius:18px; text-align:center; color:var(--text-secondary);">${a(i(`pathTab.emptyState`))}</div>`;let _=d.length,v=m?.dayNumber===0?n(`path.summaryHub`,_,{count:_}):m?i(`path.summaryDay`,{day:m.dayNumber,total:_}):n(`path.summaryNone`,_,{count:_}),y=(()=>{let e=new Date;return`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,`0`)}-${String(e.getDate()).padStart(2,`0`)}`})(),b=l.map(t=>{let n=t.id===f,r=t.dayNumber===0,o=!r&&t.date===y,s=`path-chip${r?` path-chip--anchor`:``}${o?` path-chip--today`:``}${n?` is-selected`:``}`,c=r?i(`pathTab.chipHubTooltip`):`${o?i(`pathTab.chipTodayPrefix`)+` · `:``}${i(`tripMedia.dayBucketDay`,{n:t.dayNumber})}${t.name?` — `+t.name:``}${t.date?` · `+(e(t.date)||t.date):``}`,l=r?`<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15 8.5 22 9.3 17 14.3 18.2 21.3 12 18 5.8 21.3 7 14.3 2 9.3 9 8.5"/></svg>`:String(t.dayNumber);return`<button type="button" class="${s}" data-path-chip-day-id="${a(t.id)}" title="${a(c)}" aria-label="${a(c)}" aria-pressed="${n}">${l}</button>`}).join(``),x=s?`<button type="button" class="path-chip path-chip--add" id="pathAddDayChip" title="${a(i(`pathTab.addNewDay`))}" aria-label="${a(i(`pathTab.addNewDay`))}">+</button>`:``,S=l.findIndex(e=>e.id===f),C=S<=0,T=S<0||S>=l.length-1,E=[];if(u){let e=m?.id===u.id,t=p(u.id);E.push(`
            <div class="path-column path-column--anchor${t?` is-collapsed`:``}">
                <div class="path-card path-card--anchor${e?` is-selected`:``}" data-day-id="${a(u.id)}">
                    ${h(u,{isAnchor:!0,isSelected:e},r)}
                </div>
                ${g(u,{isAnchor:!0},s,c)}
            </div>
        `)}if(m&&m.dayNumber>0){let e=p(m.id);E.push(`
            <div class="path-column path-column--selected${e?` is-collapsed`:``}">
                <div class="path-card path-card--selected" data-day-id="${a(m.id)}">
                    ${h(m,{isAnchor:!1,isSelected:!0},r)}
                </div>
                ${g(m,{isAnchor:!1},s,c)}
            </div>
        `)}let D=`path-cards-row${E.length===1?` path-cards-row--solo-anchor`:``}`;return`
        <div class="path-strip">
            <button type="button" class="path-nav-btn" id="pathPrevBtn" title="${a(i(`pathTab.previousDay`))}" aria-label="${a(i(`pathTab.previousDay`))}" ${C?`disabled`:``}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <div class="path-chips" role="group" aria-label="${a(i(`pathTab.tripDaysGroupAria`))}">
                ${b}
                ${x}
            </div>
            <button type="button" class="path-nav-btn" id="pathNextBtn" title="${a(i(`pathTab.nextDay`))}" aria-label="${a(i(`pathTab.nextDay`))}" ${T?`disabled`:``}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        </div>
        <div class="path-summary">${a(v)}</div>
        <div class="${D}">${E.join(``)}</div>
    `}var v={};try{let e=localStorage.getItem(`home_path_selected_day_by_trip`);e&&(v=JSON.parse(e)||{})}catch{v={}}var y={repaintPathTab:null,onSelectedDayChange:null};function b(e){`repaintPathTab`in e&&(y.repaintPathTab=e.repaintPathTab??null),`onSelectedDayChange`in e&&(y.onSelectedDayChange=e.onSelectedDayChange??null)}function x(e){return v[e]}function S(e){if(e in v){delete v[e];try{localStorage.setItem(`home_path_selected_day_by_trip`,JSON.stringify(v))}catch{}}}function C(e,t){if(!e||!t||v[e]===t)return;v[e]=t;try{localStorage.setItem(`home_path_selected_day_by_trip`,JSON.stringify(v))}catch{}if(typeof window<`u`&&typeof window.matchMedia==`function`&&window.matchMedia(`(max-width: 720px)`).matches){let n=(r.tripDays||[]).filter(t=>t.tripId===e),i=n.find(e=>e.id===t),a=n.find(e=>Number(e.dayNumber)===0);i&&Number(i.dayNumber)>0&&(a&&m(a.id,!0),m(i.id,!1))}if(typeof y.repaintPathTab==`function`&&y.repaintPathTab(),typeof y.onSelectedDayChange==`function`)try{y.onSelectedDayChange()}catch(e){console.warn(`[GG] onSelectedDayChange threw — likely stale home closure:`,e)}let n=window.activeMap;if(!n)return;let i=(r.tripDays||[]).find(e=>e.id===t);if(!i)return;let a=typeof i.lat==`number`?i.lat:null,o=typeof i.lng==`number`?i.lng:typeof i.lon==`number`?i.lon:null;try{if(a!=null&&o!=null)n.panTo({lat:a,lng:o}),typeof n.getZoom==`function`&&n.getZoom()<13&&n.setZoom(13);else if(i.dayNumber===0){let t=(r.trips||[]).find(t=>t.id===e);t&&typeof t.lat==`number`&&typeof t.lng==`number`&&n.panTo({lat:t.lat,lng:t.lng})}}catch{}}function w(e,t){if(!e||!t.length)return null;let n=v[e.id];if(n&&t.some(e=>e.id===n))return n;let r=new Date().toISOString().slice(0,10),i=t.find(e=>e.dayNumber>0&&e.date===r);if(i)return i.id;let a=t.find(e=>e.dayNumber>0);return a?a.id:t[0].id}export{C as a,w as i,x as n,_ as o,b as r,f as s,S as t};
//# sourceMappingURL=pathSelection-CuDbyc9b.js.map