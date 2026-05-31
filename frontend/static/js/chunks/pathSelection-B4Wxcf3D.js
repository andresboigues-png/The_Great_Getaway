import{Bt as e,C as t,Ht as n,S as r,Ut as i,Wt as a,Yt as o,in as s}from"../app.bundle.js";var c=(t,r)=>`<span style="display:inline-flex;align-items:center;gap:6px;justify-content:center">${e(t)}${i(n(r))}</span>`,l=`home_path_card_collapsed_day_ids`;function u(){try{let e=localStorage.getItem(l);if(!e)return new Set;let t=JSON.parse(e);return new Set(Array.isArray(t)?t:[])}catch{return new Set}}function d(e){try{localStorage.setItem(l,JSON.stringify([...e]))}catch{}}function f(e){let t=u();return t.has(e)?(t.delete(e),d(t),!1):(t.add(e),d(t),!0)}function p(e){return u().has(e)}function m(e,t){let n=u(),r=n.has(e);t&&!r?(n.add(e),d(n)):!t&&r&&(n.delete(e),d(n))}function h(t,s,c){let{isAnchor:l,isSelected:u}=s,d=l?`<div style="background: var(--gradient-anchor-deep); color: white; width: 48px; height: 48px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(212,160,23,0.28);">
               <!-- 2026-05-21: replaced the anchor glyph with a 5-point
                    star to match the Trip Anchor → Trip Hub rename. -->
               <svg width="26" height="26" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">
                   <polygon points="12 2 15 8.5 22 9.3 17 14.3 18.2 21.3 12 18 5.8 21.3 7 14.3 2 9.3 9 8.5"/>
               </svg>
           </div>`:`<div style="background: var(--gradient-title); color: white; width: 48px; height: 48px; border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(0,113,227,0.15);">
               <span style="font-size: 0.6rem; font-weight: 800; text-transform: uppercase; opacity: 0.85; letter-spacing: 0.05em; line-height:1;">${i(r(`pathTab.dayBadgeLabel`))}</span>
               <span style="font-size: 1.25rem; font-weight: 800; line-height: 1.05;">${t.dayNumber}</span>
           </div>`,f=l?r(`pathTab.hubTitle`):i(t.name||r(`tripMedia.dayBucketDay`,{n:t.dayNumber})),p=[];if(l){p.push(c&&c.country?i(o(c.country)):i(r(`pathTab.hubSubtitleFallback`)));let n=(c.documents||[]).filter(e=>e.dayId===t.id),a=(c.photos||[]).filter(e=>e.dayId===t.id),s=n.length+(t.tickets||[]).length,l=a.length+(t.photos||[]).length;l&&p.push(`<span style="display:inline-flex; align-items:center; gap:4px; background:rgba(52,199,89,0.12); color:#1a6b3c; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:800;">${e(`photo`,{size:13})}${l}</span>`),s&&p.push(`<span style="display:inline-flex; align-items:center; gap:4px; background:rgba(88,86,214,0.12); color:#5856d6; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:800;">${e(`document`,{size:13})}${s}</span>`)}else p.push(`<button type="button" class="day-card__date-btn" data-day-id="${i(t.id)}" aria-label="${i(r(`pathTab.setDatePlaceholder`))}" style="display:inline-flex; align-items:center; gap:5px; background:none; border:none; padding:0; margin:0; font:inherit; color:inherit; cursor:pointer;">${e(`calendar`,{size:14})}${a(t.date)||r(`pathTab.setDatePlaceholder`)}</button>`),t.lat?p.push(`<span style="color: #005bb8;">${i(r(`pathTab.locationSet`))}</span>`):p.push(`<span class="day-card__pin-hint" style="display:inline-flex; align-items:center; gap:4px;">${e(`pinned`,{size:13})}${i(n(r(`pathTab.pinThisDay`)))}</span>`),t.date&&p.push(`<span class="day-card__weather" data-weather-date="${i(t.date)}"></span>`);let m=u&&t.notes&&!l?`
        <div style="margin-top: 12px; padding: 12px 14px; background: rgba(0,113,227,0.04); border-radius: 14px; border-left: 3px solid var(--accent-blue);">
            <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: #005bb8; margin-bottom: 4px; letter-spacing: 0.05em;">${i(r(`pathTab.journalPreviewLabel`))}</div>
            <p style="margin: 0; font-size: 0.9rem; line-height: 1.45; color: #002d5b; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${i(t.notes)}</p>
        </div>
    `:``,h=`
        <button type="button" class="path-card-collapse-btn" data-day-id="${i(t.id)}"
            aria-label="${i(r(`pathTab.toggleOptionsAria`,{title:f}))}" title="${i(r(`pathTab.toggleOptionsTitle`))}">
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
    `}function g(e,t,n,a){if(!e||!n)return``;let{isAnchor:o}=t,s=[];if(o?s.push(`<button class="path-primary-btn path-primary-btn--anchor path-checklist-btn" data-day-id="${i(e.id)}">${c(`checklist`,r(`pathTab.btnChecklist`))}</button>`):s.push(`<button class="path-primary-btn day-detail-btn" data-day-id="${i(e.id)}">${c(`plan`,r(`pathTab.btnOpenFullPlan`))}</button>`),a===e.id)s.push(`<button class="day-action-btn day-action-btn--success day-pin-save-btn" data-day-id="${i(e.id)}">${i(r(`pathTab.btnSavePin`))}</button>`),s.push(`<button class="day-action-btn day-action-btn--danger-fill day-pin-delete-btn" data-day-id="${i(e.id)}">${i(r(`pathTab.btnCancelPinEdit`))}</button>`);else{let t=e.lat?r(o?`pathTab.btnEditAnchorPin`:`pathTab.btnEditPin`):r(o?`pathTab.btnSetAnchorPin`:`pathTab.btnAddPin`);s.push(`<button class="day-action-btn day-action-btn--neutral day-pin-toggle-btn" data-day-id="${i(e.id)}">${c(`pin`,t)}</button>`)}return o?(s.push(`<button class="day-action-btn day-action-btn--neutral path-documents-btn" data-day-id="${i(e.id)}">${c(`document`,r(`pathTab.btnDocuments`))}</button>`),s.push(`<button class="day-action-btn day-action-btn--neutral path-photos-btn" data-day-id="${i(e.id)}">${c(`photo`,r(`pathTab.btnPhotos`))}</button>`)):(s.push(`<button class="day-action-btn day-action-btn--neutral day-journaling-btn" data-day-id="${i(e.id)}">${c(`journal`,r(`pathTab.btnJournaling`))}</button>`),s.push(`<button class="day-action-btn day-action-btn--danger day-delete-btn" data-day-id="${i(e.id)}">${c(`trash`,r(`pathTab.btnDeleteDay`))}</button>`)),`<div class="path-options-stack">${s.join(``)}</div>`}function _(e){let{activeTrip:n,tripDays:o,tripIsEditable:s,editingDayId:c}=e,l=[...o].sort((e,t)=>e.dayNumber-t.dayNumber),u=l.find(e=>e.dayNumber===0)||null,d=l.filter(e=>e.dayNumber>0),f=w(n,l),m=l.find(e=>e.id===f)||null;if(l.length===0)return`<div class="card glass" style="padding:28px; border-radius:18px; text-align:center; color:var(--text-secondary);">${i(r(`pathTab.emptyState`))}</div>`;let _=d.length,v=m?.dayNumber===0?t(`path.summaryHub`,_,{count:_}):m?r(`path.summaryDay`,{day:m.dayNumber,total:_}):t(`path.summaryNone`,_,{count:_}),y=(()=>{let e=new Date;return`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,`0`)}-${String(e.getDate()).padStart(2,`0`)}`})(),b=l.map(e=>{let t=e.id===f,n=e.dayNumber===0,o=!n&&e.date===y,s=`path-chip${n?` path-chip--anchor`:``}${o?` path-chip--today`:``}${t?` is-selected`:``}`,c=n?r(`pathTab.chipHubTooltip`):`${o?r(`pathTab.chipTodayPrefix`)+` · `:``}${r(`tripMedia.dayBucketDay`,{n:e.dayNumber})}${e.name?` — `+e.name:``}${e.date?` · `+(a(e.date)||e.date):``}`,l=n?`<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15 8.5 22 9.3 17 14.3 18.2 21.3 12 18 5.8 21.3 7 14.3 2 9.3 9 8.5"/></svg>`:String(e.dayNumber);return`<button type="button" class="${s}" data-path-chip-day-id="${i(e.id)}" title="${i(c)}" aria-label="${i(c)}" aria-pressed="${t}">${l}</button>`}).join(``),x=s?`<button type="button" class="path-chip path-chip--add" id="pathAddDayChip" title="${i(r(`pathTab.addNewDay`))}" aria-label="${i(r(`pathTab.addNewDay`))}">+</button>`:``,S=l.findIndex(e=>e.id===f),C=S<=0,T=S<0||S>=l.length-1,E=[];if(u){let e=m?.id===u.id,t=p(u.id);E.push(`
            <div class="path-column path-column--anchor${t?` is-collapsed`:``}">
                <div class="path-card path-card--anchor${e?` is-selected`:``}" data-day-id="${i(u.id)}">
                    ${h(u,{isAnchor:!0,isSelected:e},n)}
                </div>
                ${g(u,{isAnchor:!0},s,c)}
            </div>
        `)}if(m&&m.dayNumber>0){let e=p(m.id);E.push(`
            <div class="path-column path-column--selected${e?` is-collapsed`:``}">
                <div class="path-card path-card--selected" data-day-id="${i(m.id)}">
                    ${h(m,{isAnchor:!1,isSelected:!0},n)}
                </div>
                ${g(m,{isAnchor:!1},s,c)}
            </div>
        `)}let D=`path-cards-row${E.length===1?` path-cards-row--solo-anchor`:``}`;return`
        <div class="path-strip">
            <button type="button" class="path-nav-btn" id="pathPrevBtn" title="${i(r(`pathTab.previousDay`))}" aria-label="${i(r(`pathTab.previousDay`))}" ${C?`disabled`:``}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <div class="path-chips" role="group" aria-label="${i(r(`pathTab.tripDaysGroupAria`))}">
                ${b}
                ${x}
            </div>
            <button type="button" class="path-nav-btn" id="pathNextBtn" title="${i(r(`pathTab.nextDay`))}" aria-label="${i(r(`pathTab.nextDay`))}" ${T?`disabled`:``}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        </div>
        <div class="path-summary">${i(v)}</div>
        <div class="${D}">${E.join(``)}</div>
    `}var v={};try{let e=localStorage.getItem(`home_path_selected_day_by_trip`);e&&(v=JSON.parse(e)||{})}catch{v={}}var y={repaintPathTab:null,onSelectedDayChange:null};function b(e){`repaintPathTab`in e&&(y.repaintPathTab=e.repaintPathTab??null),`onSelectedDayChange`in e&&(y.onSelectedDayChange=e.onSelectedDayChange??null)}function x(e){return v[e]}function S(e){if(e in v){delete v[e];try{localStorage.setItem(`home_path_selected_day_by_trip`,JSON.stringify(v))}catch{}}}function C(e,t){if(!e||!t||v[e]===t)return;v[e]=t;try{localStorage.setItem(`home_path_selected_day_by_trip`,JSON.stringify(v))}catch{}if(typeof window<`u`&&typeof window.matchMedia==`function`&&window.matchMedia(`(max-width: 720px)`).matches){let n=(s.tripDays||[]).filter(t=>t.tripId===e),r=n.find(e=>e.id===t),i=n.find(e=>Number(e.dayNumber)===0);r&&Number(r.dayNumber)>0&&(i&&m(i.id,!0),m(r.id,!1))}if(typeof y.repaintPathTab==`function`&&y.repaintPathTab(),typeof y.onSelectedDayChange==`function`)try{y.onSelectedDayChange()}catch(e){console.warn(`[GG] onSelectedDayChange threw — likely stale home closure:`,e)}let n=window.activeMap;if(!n)return;let r=(s.tripDays||[]).find(e=>e.id===t);if(!r)return;let i=typeof r.lat==`number`?r.lat:null,a=typeof r.lng==`number`?r.lng:typeof r.lon==`number`?r.lon:null;try{if(i!=null&&a!=null)n.panTo({lat:i,lng:a}),typeof n.getZoom==`function`&&n.getZoom()<13&&n.setZoom(13);else if(r.dayNumber===0){let t=(s.trips||[]).find(t=>t.id===e);t&&typeof t.lat==`number`&&typeof t.lng==`number`&&n.panTo({lat:t.lat,lng:t.lng})}}catch{}}function w(e,t){if(!e||!t.length)return null;let n=v[e.id];if(n&&t.some(e=>e.id===n))return n;let r=new Date().toISOString().slice(0,10),i=t.find(e=>e.dayNumber>0&&e.date===r);if(i)return i.id;let a=t.find(e=>e.dayNumber>0);return a?a.id:t[0].id}export{C as a,w as i,x as n,_ as o,b as r,f as s,S as t};
//# sourceMappingURL=pathSelection-B4Wxcf3D.js.map