import{$t as e,A as t,an as n,bn as r,dn as i,k as a,nn as o,rn as s,tn as c}from"../app.bundle.js";var l=(t,n)=>`<span style="display:inline-flex;align-items:center;gap:6px;justify-content:center">${e(t)}${o(c(n))}</span>`,u=`home_path_card_collapsed_day_ids`;function d(){try{let e=localStorage.getItem(u);if(!e)return new Set;let t=JSON.parse(e);return new Set(Array.isArray(t)?t:[])}catch{return new Set}}function f(e){try{localStorage.setItem(u,JSON.stringify([...e]))}catch{}}function p(e){let t=d();return t.has(e)?(t.delete(e),f(t),!1):(t.add(e),f(t),!0)}function m(e){return d().has(e)}function h(e,t){let n=d(),r=n.has(e);t&&!r?(n.add(e),f(n)):!t&&r&&(n.delete(e),f(n))}function g(t,n,r){let{isAnchor:l,isSelected:u}=n,d=l?`<div style="background: var(--gradient-anchor-deep); color: white; width: 48px; height: 48px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(212,160,23,0.28);">
               <!-- 2026-05-21: replaced the anchor glyph with a 5-point
                    star to match the Trip Anchor → Trip Hub rename. -->
               <svg width="26" height="26" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">
                   <polygon points="12 2 15 8.5 22 9.3 17 14.3 18.2 21.3 12 18 5.8 21.3 7 14.3 2 9.3 9 8.5"/>
               </svg>
           </div>`:`<div style="background: var(--gradient-title); color: white; width: 48px; height: 48px; border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(0,113,227,0.15);">
               <span style="font-size: 0.6rem; font-weight: 800; text-transform: uppercase; opacity: 0.85; letter-spacing: 0.05em; line-height:1;">${o(a(`pathTab.dayBadgeLabel`))}</span>
               <span style="font-size: 1.25rem; font-weight: 800; line-height: 1.05;">${t.dayNumber}</span>
           </div>`,f=l?a(`pathTab.hubTitle`):o(t.name||a(`tripMedia.dayBucketDay`,{n:t.dayNumber})),p=[];if(l){p.push(r&&r.country?o(i(r.country)):o(a(`pathTab.hubSubtitleFallback`)));let n=(r.documents||[]).filter(e=>e.dayId===t.id),s=(r.photos||[]).filter(e=>e.dayId===t.id),c=n.length+(t.tickets||[]).length,l=s.length+(t.photos||[]).length;l&&p.push(`<span style="display:inline-flex; align-items:center; gap:4px; background:rgba(52,199,89,0.12); color:#1a6b3c; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:800;">${e(`photo`,{size:13})}${l}</span>`),c&&p.push(`<span style="display:inline-flex; align-items:center; gap:4px; background:rgba(88,86,214,0.12); color:#5856d6; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:800;">${e(`document`,{size:13})}${c}</span>`)}else p.push(`<button type="button" class="day-card__date-btn" data-day-id="${o(t.id)}" aria-label="${o(a(`pathTab.setDatePlaceholder`))}" style="display:inline-flex; align-items:center; gap:5px; background:none; border:none; padding:0; margin:0; font:inherit; color:inherit; cursor:pointer;">${e(`calendar`,{size:14})}${s(t.date)||a(`pathTab.setDatePlaceholder`)}</button>`),t.lat?p.push(`<span style="color: #005bb8;">${o(a(`pathTab.locationSet`))}</span>`):p.push(`<span class="day-card__pin-hint" style="display:inline-flex; align-items:center; gap:4px;">${e(`pinned`,{size:13})}${o(c(a(`pathTab.pinThisDay`)))}</span>`),t.date&&p.push(`<span class="day-card__weather" data-weather-date="${o(t.date)}"></span>`);let m=u&&t.notes&&!l?`
        <div style="margin-top: 12px; padding: 12px 14px; background: rgba(0,113,227,0.04); border-radius: 14px; border-left: 3px solid var(--accent-blue);">
            <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: #005bb8; margin-bottom: 4px; letter-spacing: 0.05em;">${o(a(`pathTab.journalPreviewLabel`))}</div>
            <p style="margin: 0; font-size: 0.9rem; line-height: 1.45; color: #002d5b; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${o(t.notes)}</p>
        </div>
    `:``,h=`
        <button type="button" class="path-card-collapse-btn" data-day-id="${o(t.id)}"
            aria-label="${o(a(`pathTab.toggleOptionsAria`,{title:f}))}" title="${o(a(`pathTab.toggleOptionsTitle`))}">
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
    `}function _(e,t,n,r){if(!e||!n)return``;let{isAnchor:i}=t,s=[];if(i?s.push(`<button class="path-primary-btn path-primary-btn--anchor path-checklist-btn" data-day-id="${o(e.id)}">${l(`checklist`,a(`pathTab.btnChecklist`))}</button>`):s.push(`<button class="path-primary-btn day-detail-btn" data-day-id="${o(e.id)}">${l(`plan`,a(`pathTab.btnOpenFullPlan`))}</button>`),r===e.id)s.push(`<button class="day-action-btn day-action-btn--success day-pin-save-btn" data-day-id="${o(e.id)}">${o(a(`pathTab.btnSavePin`))}</button>`),s.push(`<button class="day-action-btn day-action-btn--danger-fill day-pin-delete-btn" data-day-id="${o(e.id)}">${o(a(`pathTab.btnCancelPinEdit`))}</button>`);else{let t=e.lat?a(i?`pathTab.btnEditAnchorPin`:`pathTab.btnEditPin`):a(i?`pathTab.btnSetAnchorPin`:`pathTab.btnAddPin`);s.push(`<button class="day-action-btn day-action-btn--neutral day-pin-toggle-btn" data-day-id="${o(e.id)}">${l(`pin`,t)}</button>`)}return i?(s.push(`<button class="day-action-btn day-action-btn--neutral path-documents-btn" data-day-id="${o(e.id)}">${l(`document`,a(`pathTab.btnDocuments`))}</button>`),s.push(`<button class="day-action-btn day-action-btn--neutral path-photos-btn" data-day-id="${o(e.id)}">${l(`photo`,a(`pathTab.btnPhotos`))}</button>`)):(s.push(`<button class="day-action-btn day-action-btn--neutral day-journaling-btn" data-day-id="${o(e.id)}">${l(`journal`,a(`pathTab.btnJournaling`))}</button>`),s.push(`<button class="day-action-btn day-action-btn--danger day-delete-btn" data-day-id="${o(e.id)}">${l(`trash`,a(`pathTab.btnDeleteDay`))}</button>`)),`<div class="path-options-stack">${s.join(``)}</div>`}function v(e){let{activeTrip:r,tripDays:i,tripIsEditable:c,editingDayId:l}=e,u=[...i].sort((e,t)=>e.dayNumber-t.dayNumber),d=u.find(e=>e.dayNumber===0)||null,f=u.filter(e=>e.dayNumber>0),p=T(r,u),h=u.find(e=>e.id===p)||null;if(u.length===0)return`<div class="card glass" style="padding:28px; border-radius:18px; text-align:center; color:var(--text-secondary);">${o(a(`pathTab.emptyState`))}</div>`;let v=f.length,y=h?.dayNumber===0?t(`path.summaryHub`,v,{count:v}):h?a(`path.summaryDay`,{day:h.dayNumber,total:v}):t(`path.summaryNone`,v,{count:v}),b=n(),x=u.map(e=>{let t=e.id===p,n=e.dayNumber===0,r=!n&&e.date===b,i=`path-chip${n?` path-chip--anchor`:``}${r?` path-chip--today`:``}${t?` is-selected`:``}`,c=n?a(`pathTab.chipHubTooltip`):`${r?a(`pathTab.chipTodayPrefix`)+` · `:``}${a(`tripMedia.dayBucketDay`,{n:e.dayNumber})}${e.name?` — `+e.name:``}${e.date?` · `+(s(e.date)||e.date):``}`,l=n?`<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15 8.5 22 9.3 17 14.3 18.2 21.3 12 18 5.8 21.3 7 14.3 2 9.3 9 8.5"/></svg>`:String(e.dayNumber);return`<button type="button" class="${i}" data-path-chip-day-id="${o(e.id)}" title="${o(c)}" aria-label="${o(c)}" aria-pressed="${t}">${l}</button>`}).join(``),S=c?`<button type="button" class="path-chip path-chip--add" id="pathAddDayChip" title="${o(a(`pathTab.addNewDay`))}" aria-label="${o(a(`pathTab.addNewDay`))}">+</button>`:``,C=u.findIndex(e=>e.id===p),w=C<=0,E=C<0||C>=u.length-1,D=[];if(d){let e=h?.id===d.id,t=m(d.id);D.push(`
            <div class="path-column path-column--anchor${t?` is-collapsed`:``}">
                <div class="path-card path-card--anchor${e?` is-selected`:``}" data-day-id="${o(d.id)}">
                    ${g(d,{isAnchor:!0,isSelected:e},r)}
                </div>
                ${_(d,{isAnchor:!0},c,l)}
            </div>
        `)}if(h&&h.dayNumber>0){let e=m(h.id);D.push(`
            <div class="path-column path-column--selected${e?` is-collapsed`:``}">
                <div class="path-card path-card--selected" data-day-id="${o(h.id)}">
                    ${g(h,{isAnchor:!1,isSelected:!0},r)}
                </div>
                ${_(h,{isAnchor:!1},c,l)}
            </div>
        `)}let O=`path-cards-row${D.length===1?` path-cards-row--solo-anchor`:``}`;return`
        <div class="path-strip">
            <button type="button" class="path-nav-btn" id="pathPrevBtn" title="${o(a(`pathTab.previousDay`))}" aria-label="${o(a(`pathTab.previousDay`))}" ${w?`disabled`:``}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <div class="path-chips" role="group" aria-label="${o(a(`pathTab.tripDaysGroupAria`))}">
                ${x}
                ${S}
            </div>
            <button type="button" class="path-nav-btn" id="pathNextBtn" title="${o(a(`pathTab.nextDay`))}" aria-label="${o(a(`pathTab.nextDay`))}" ${E?`disabled`:``}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        </div>
        <div class="path-summary">${o(y)}</div>
        <div class="${O}">${D.join(``)}</div>
    `}var y={};try{let e=localStorage.getItem(`home_path_selected_day_by_trip`);e&&(y=JSON.parse(e)||{})}catch{y={}}var b={repaintPathTab:null,onSelectedDayChange:null};function x(e){`repaintPathTab`in e&&(b.repaintPathTab=e.repaintPathTab??null),`onSelectedDayChange`in e&&(b.onSelectedDayChange=e.onSelectedDayChange??null)}function S(e){return y[e]}function C(e){if(e in y){delete y[e];try{localStorage.setItem(`home_path_selected_day_by_trip`,JSON.stringify(y))}catch{}}}function w(e,t){if(!e||!t||y[e]===t)return;y[e]=t;try{localStorage.setItem(`home_path_selected_day_by_trip`,JSON.stringify(y))}catch{}if(typeof window<`u`&&typeof window.matchMedia==`function`&&window.matchMedia(`(max-width: 720px)`).matches){let n=(r.tripDays||[]).filter(t=>t.tripId===e),i=n.find(e=>e.id===t),a=n.find(e=>Number(e.dayNumber)===0);i&&Number(i.dayNumber)>0&&(a&&h(a.id,!0),h(i.id,!1))}if(typeof b.repaintPathTab==`function`&&b.repaintPathTab(),typeof b.onSelectedDayChange==`function`)try{b.onSelectedDayChange()}catch(e){console.warn(`[GG] onSelectedDayChange threw — likely stale home closure:`,e)}let n=window.activeMap;if(!n)return;let i=(r.tripDays||[]).find(e=>e.id===t);if(!i)return;let a=typeof i.lat==`number`?i.lat:null,o=typeof i.lng==`number`?i.lng:typeof i.lon==`number`?i.lon:null;try{if(a!=null&&o!=null)n.panTo({lat:a,lng:o}),typeof n.getZoom==`function`&&n.getZoom()<13&&n.setZoom(13);else if(i.dayNumber===0){let t=(r.trips||[]).find(t=>t.id===e);t&&typeof t.lat==`number`&&typeof t.lng==`number`&&n.panTo({lat:t.lat,lng:t.lng})}}catch{}}function T(e,t){if(!e||!t.length)return null;let r=y[e.id];if(r&&t.some(e=>e.id===r))return r;let i=n(),a=t.find(e=>e.dayNumber>0&&e.date===i);if(a)return a.id;let o=t.find(e=>e.dayNumber>0);return o?o.id:t[0].id}export{w as a,T as i,S as n,v as o,x as r,p as s,C as t};
//# sourceMappingURL=pathSelection-CXa6kXv5.js.map