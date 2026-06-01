import{A as e,Jt as t,Qt as n,Xt as r,Zt as i,en as a,hn as o,k as s,on as c}from"../app.bundle.js";var l=(e,n)=>`<span style="display:inline-flex;align-items:center;gap:6px;justify-content:center">${t(e)}${i(r(n))}</span>`,u=`home_path_card_collapsed_day_ids`;function d(){try{let e=localStorage.getItem(u);if(!e)return new Set;let t=JSON.parse(e);return new Set(Array.isArray(t)?t:[])}catch{return new Set}}function f(e){try{localStorage.setItem(u,JSON.stringify([...e]))}catch{}}function p(e){let t=d();return t.has(e)?(t.delete(e),f(t),!1):(t.add(e),f(t),!0)}function m(e){return d().has(e)}function h(e,t){let n=d(),r=n.has(e);t&&!r?(n.add(e),f(n)):!t&&r&&(n.delete(e),f(n))}function g(e,a,o){let{isAnchor:l,isSelected:u}=a,d=l?`<div style="background: var(--gradient-anchor-deep); color: white; width: 48px; height: 48px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(212,160,23,0.28);">
               <!-- 2026-05-21: replaced the anchor glyph with a 5-point
                    star to match the Trip Anchor → Trip Hub rename. -->
               <svg width="26" height="26" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">
                   <polygon points="12 2 15 8.5 22 9.3 17 14.3 18.2 21.3 12 18 5.8 21.3 7 14.3 2 9.3 9 8.5"/>
               </svg>
           </div>`:`<div style="background: var(--gradient-title); color: white; width: 48px; height: 48px; border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(0,113,227,0.15);">
               <span style="font-size: 0.6rem; font-weight: 800; text-transform: uppercase; opacity: 0.85; letter-spacing: 0.05em; line-height:1;">${i(s(`pathTab.dayBadgeLabel`))}</span>
               <span style="font-size: 1.25rem; font-weight: 800; line-height: 1.05;">${e.dayNumber}</span>
           </div>`,f=l?s(`pathTab.hubTitle`):i(e.name||s(`tripMedia.dayBucketDay`,{n:e.dayNumber})),p=[];if(l){p.push(o&&o.country?i(c(o.country)):i(s(`pathTab.hubSubtitleFallback`)));let n=(o.documents||[]).filter(t=>t.dayId===e.id),r=(o.photos||[]).filter(t=>t.dayId===e.id),a=n.length+(e.tickets||[]).length,l=r.length+(e.photos||[]).length;l&&p.push(`<span style="display:inline-flex; align-items:center; gap:4px; background:rgba(52,199,89,0.12); color:#1a6b3c; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:800;">${t(`photo`,{size:13})}${l}</span>`),a&&p.push(`<span style="display:inline-flex; align-items:center; gap:4px; background:rgba(88,86,214,0.12); color:#5856d6; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:800;">${t(`document`,{size:13})}${a}</span>`)}else p.push(`<button type="button" class="day-card__date-btn" data-day-id="${i(e.id)}" aria-label="${i(s(`pathTab.setDatePlaceholder`))}" style="display:inline-flex; align-items:center; gap:5px; background:none; border:none; padding:0; margin:0; font:inherit; color:inherit; cursor:pointer;">${t(`calendar`,{size:14})}${n(e.date)||s(`pathTab.setDatePlaceholder`)}</button>`),e.lat?p.push(`<span style="color: #005bb8;">${i(s(`pathTab.locationSet`))}</span>`):p.push(`<span class="day-card__pin-hint" style="display:inline-flex; align-items:center; gap:4px;">${t(`pinned`,{size:13})}${i(r(s(`pathTab.pinThisDay`)))}</span>`),e.date&&p.push(`<span class="day-card__weather" data-weather-date="${i(e.date)}"></span>`);let m=u&&e.notes&&!l?`
        <div style="margin-top: 12px; padding: 12px 14px; background: rgba(0,113,227,0.04); border-radius: 14px; border-left: 3px solid var(--accent-blue);">
            <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: #005bb8; margin-bottom: 4px; letter-spacing: 0.05em;">${i(s(`pathTab.journalPreviewLabel`))}</div>
            <p style="margin: 0; font-size: 0.9rem; line-height: 1.45; color: #002d5b; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${i(e.notes)}</p>
        </div>
    `:``,h=`
        <button type="button" class="path-card-collapse-btn" data-day-id="${i(e.id)}"
            aria-label="${i(s(`pathTab.toggleOptionsAria`,{title:f}))}" title="${i(s(`pathTab.toggleOptionsTitle`))}">
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
    `}function _(e,t,n,r){if(!e||!n)return``;let{isAnchor:a}=t,o=[];if(a?o.push(`<button class="path-primary-btn path-primary-btn--anchor path-checklist-btn" data-day-id="${i(e.id)}">${l(`checklist`,s(`pathTab.btnChecklist`))}</button>`):o.push(`<button class="path-primary-btn day-detail-btn" data-day-id="${i(e.id)}">${l(`plan`,s(`pathTab.btnOpenFullPlan`))}</button>`),r===e.id)o.push(`<button class="day-action-btn day-action-btn--success day-pin-save-btn" data-day-id="${i(e.id)}">${i(s(`pathTab.btnSavePin`))}</button>`),o.push(`<button class="day-action-btn day-action-btn--danger-fill day-pin-delete-btn" data-day-id="${i(e.id)}">${i(s(`pathTab.btnCancelPinEdit`))}</button>`);else{let t=e.lat?s(a?`pathTab.btnEditAnchorPin`:`pathTab.btnEditPin`):s(a?`pathTab.btnSetAnchorPin`:`pathTab.btnAddPin`);o.push(`<button class="day-action-btn day-action-btn--neutral day-pin-toggle-btn" data-day-id="${i(e.id)}">${l(`pin`,t)}</button>`)}return a?(o.push(`<button class="day-action-btn day-action-btn--neutral path-documents-btn" data-day-id="${i(e.id)}">${l(`document`,s(`pathTab.btnDocuments`))}</button>`),o.push(`<button class="day-action-btn day-action-btn--neutral path-photos-btn" data-day-id="${i(e.id)}">${l(`photo`,s(`pathTab.btnPhotos`))}</button>`)):(o.push(`<button class="day-action-btn day-action-btn--neutral day-journaling-btn" data-day-id="${i(e.id)}">${l(`journal`,s(`pathTab.btnJournaling`))}</button>`),o.push(`<button class="day-action-btn day-action-btn--danger day-delete-btn" data-day-id="${i(e.id)}">${l(`trash`,s(`pathTab.btnDeleteDay`))}</button>`)),`<div class="path-options-stack">${o.join(``)}</div>`}function v(t){let{activeTrip:r,tripDays:o,tripIsEditable:c,editingDayId:l}=t,u=[...o].sort((e,t)=>e.dayNumber-t.dayNumber),d=u.find(e=>e.dayNumber===0)||null,f=u.filter(e=>e.dayNumber>0),p=T(r,u),h=u.find(e=>e.id===p)||null;if(u.length===0)return`<div class="card glass" style="padding:28px; border-radius:18px; text-align:center; color:var(--text-secondary);">${i(s(`pathTab.emptyState`))}</div>`;let v=f.length,y=h?.dayNumber===0?e(`path.summaryHub`,v,{count:v}):h?s(`path.summaryDay`,{day:h.dayNumber,total:v}):e(`path.summaryNone`,v,{count:v}),b=a(),x=u.map(e=>{let t=e.id===p,r=e.dayNumber===0,a=!r&&e.date===b,o=`path-chip${r?` path-chip--anchor`:``}${a?` path-chip--today`:``}${t?` is-selected`:``}`,c=r?s(`pathTab.chipHubTooltip`):`${a?s(`pathTab.chipTodayPrefix`)+` · `:``}${s(`tripMedia.dayBucketDay`,{n:e.dayNumber})}${e.name?` — `+e.name:``}${e.date?` · `+(n(e.date)||e.date):``}`,l=r?`<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15 8.5 22 9.3 17 14.3 18.2 21.3 12 18 5.8 21.3 7 14.3 2 9.3 9 8.5"/></svg>`:String(e.dayNumber);return`<button type="button" class="${o}" data-path-chip-day-id="${i(e.id)}" title="${i(c)}" aria-label="${i(c)}" aria-pressed="${t}">${l}</button>`}).join(``),S=c?`<button type="button" class="path-chip path-chip--add" id="pathAddDayChip" title="${i(s(`pathTab.addNewDay`))}" aria-label="${i(s(`pathTab.addNewDay`))}">+</button>`:``,C=u.findIndex(e=>e.id===p),w=C<=0,E=C<0||C>=u.length-1,D=[];if(d){let e=h?.id===d.id,t=m(d.id);D.push(`
            <div class="path-column path-column--anchor${t?` is-collapsed`:``}">
                <div class="path-card path-card--anchor${e?` is-selected`:``}" data-day-id="${i(d.id)}">
                    ${g(d,{isAnchor:!0,isSelected:e},r)}
                </div>
                ${_(d,{isAnchor:!0},c,l)}
            </div>
        `)}if(h&&h.dayNumber>0){let e=m(h.id);D.push(`
            <div class="path-column path-column--selected${e?` is-collapsed`:``}">
                <div class="path-card path-card--selected" data-day-id="${i(h.id)}">
                    ${g(h,{isAnchor:!1,isSelected:!0},r)}
                </div>
                ${_(h,{isAnchor:!1},c,l)}
            </div>
        `)}let O=`path-cards-row${D.length===1?` path-cards-row--solo-anchor`:``}`;return`
        <div class="path-strip">
            <button type="button" class="path-nav-btn" id="pathPrevBtn" title="${i(s(`pathTab.previousDay`))}" aria-label="${i(s(`pathTab.previousDay`))}" ${w?`disabled`:``}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <div class="path-chips" role="group" aria-label="${i(s(`pathTab.tripDaysGroupAria`))}">
                ${x}
                ${S}
            </div>
            <button type="button" class="path-nav-btn" id="pathNextBtn" title="${i(s(`pathTab.nextDay`))}" aria-label="${i(s(`pathTab.nextDay`))}" ${E?`disabled`:``}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        </div>
        <div class="path-summary">${i(y)}</div>
        <div class="${O}">${D.join(``)}</div>
    `}var y={};try{let e=localStorage.getItem(`home_path_selected_day_by_trip`);e&&(y=JSON.parse(e)||{})}catch{y={}}var b={repaintPathTab:null,onSelectedDayChange:null};function x(e){`repaintPathTab`in e&&(b.repaintPathTab=e.repaintPathTab??null),`onSelectedDayChange`in e&&(b.onSelectedDayChange=e.onSelectedDayChange??null)}function S(e){return y[e]}function C(e){if(e in y){delete y[e];try{localStorage.setItem(`home_path_selected_day_by_trip`,JSON.stringify(y))}catch{}}}function w(e,t){if(!e||!t||y[e]===t)return;y[e]=t;try{localStorage.setItem(`home_path_selected_day_by_trip`,JSON.stringify(y))}catch{}if(typeof window<`u`&&typeof window.matchMedia==`function`&&window.matchMedia(`(max-width: 720px)`).matches){let n=(o.tripDays||[]).filter(t=>t.tripId===e),r=n.find(e=>e.id===t),i=n.find(e=>Number(e.dayNumber)===0);r&&Number(r.dayNumber)>0&&(i&&h(i.id,!0),h(r.id,!1))}if(typeof b.repaintPathTab==`function`&&b.repaintPathTab(),typeof b.onSelectedDayChange==`function`)try{b.onSelectedDayChange()}catch(e){console.warn(`[GG] onSelectedDayChange threw — likely stale home closure:`,e)}let n=window.activeMap;if(!n)return;let r=(o.tripDays||[]).find(e=>e.id===t);if(!r)return;let i=typeof r.lat==`number`?r.lat:null,a=typeof r.lng==`number`?r.lng:typeof r.lon==`number`?r.lon:null;try{if(i!=null&&a!=null)n.panTo({lat:i,lng:a}),typeof n.getZoom==`function`&&n.getZoom()<13&&n.setZoom(13);else if(r.dayNumber===0){let t=(o.trips||[]).find(t=>t.id===e);t&&typeof t.lat==`number`&&typeof t.lng==`number`&&n.panTo({lat:t.lat,lng:t.lng})}}catch{}}function T(e,t){if(!e||!t.length)return null;let n=y[e.id];if(n&&t.some(e=>e.id===n))return n;let r=a(),i=t.find(e=>e.dayNumber>0&&e.date===r);if(i)return i.id;let o=t.find(e=>e.dayNumber>0);return o?o.id:t[0].id}export{w as a,T as i,S as n,v as o,x as r,p as s,C as t};
//# sourceMappingURL=pathSelection-BB7bubsj.js.map