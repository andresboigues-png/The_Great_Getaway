import{A as e,Sn as t,an as n,in as r,j as i,pn as a,rn as o,sn as s,tn as c}from"../app.bundle.js";var l=(e,t)=>`<span style="display:inline-flex;align-items:center;gap:6px;justify-content:center">${c(e)}${r(o(t))}</span>`,u=`home_path_card_collapsed_day_ids`;function d(){try{let e=localStorage.getItem(u);if(!e)return new Set;let t=JSON.parse(e);return new Set(Array.isArray(t)?t:[])}catch{return new Set}}function f(e){try{localStorage.setItem(u,JSON.stringify([...e]))}catch{}}function p(e){let t=d();return t.has(e)?(t.delete(e),f(t),!1):(t.add(e),f(t),!0)}function m(e){return d().has(e)}function h(e,t){let n=d(),r=n.has(e);t&&!r?(n.add(e),f(n)):!t&&r&&(n.delete(e),f(n))}function g(t,i,s){let{isAnchor:l,isSelected:u}=i,d=l?`<div style="background: var(--gradient-anchor-deep); color: white; width: 48px; height: 48px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(212,160,23,0.28);">
               <!-- 2026-05-21: replaced the anchor glyph with a 5-point
                    star to match the Trip Anchor → Trip Hub rename. -->
               <svg width="26" height="26" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">
                   <polygon points="12 2 15 8.5 22 9.3 17 14.3 18.2 21.3 12 18 5.8 21.3 7 14.3 2 9.3 9 8.5"/>
               </svg>
           </div>`:`<div style="background: var(--gradient-title); color: white; width: 48px; height: 48px; border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(0,113,227,0.15);">
               <span style="font-size: 0.6rem; font-weight: 800; text-transform: uppercase; opacity: 0.85; letter-spacing: 0.05em; line-height:1;">${r(e(`pathTab.dayBadgeLabel`))}</span>
               <span style="font-size: 1.25rem; font-weight: 800; line-height: 1.05;">${t.dayNumber}</span>
           </div>`,f=l?e(`pathTab.hubTitle`):r(t.name||e(`tripMedia.dayBucketDay`,{n:t.dayNumber})),p=[];if(l){p.push(s&&s.country?r(a(s.country)):r(e(`pathTab.hubSubtitleFallback`)));let n=(s.documents||[]).filter(e=>e.dayId===t.id),i=(s.photos||[]).filter(e=>e.dayId===t.id),o=n.length+(t.tickets||[]).length,l=i.length+(t.photos||[]).length;l&&p.push(`<span style="display:inline-flex; align-items:center; gap:4px; background:rgba(52,199,89,0.12); color:#1a6b3c; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:800;">${c(`photo`,{size:13})}${l}</span>`),o&&p.push(`<span style="display:inline-flex; align-items:center; gap:4px; background:rgba(88,86,214,0.12); color:#5856d6; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:800;">${c(`document`,{size:13})}${o}</span>`)}else p.push(`<button type="button" class="day-card__date-btn" data-day-id="${r(t.id)}" aria-label="${r(e(`pathTab.setDatePlaceholder`))}" style="display:inline-flex; align-items:center; gap:5px; background:none; border:none; padding:0; margin:0; font:inherit; color:inherit; cursor:pointer;">${c(`calendar`,{size:14})}${n(t.date)||e(`pathTab.setDatePlaceholder`)}</button>`),t.lat?p.push(`<span style="color: #005bb8;">${r(e(`pathTab.locationSet`))}</span>`):p.push(`<span class="day-card__pin-hint" style="display:inline-flex; align-items:center; gap:4px;">${c(`pinned`,{size:13})}${r(o(e(`pathTab.pinThisDay`)))}</span>`),t.date&&p.push(`<span class="day-card__weather" data-weather-date="${r(t.date)}"></span>`);let m=u&&t.notes&&!l?`
        <div style="margin-top: 12px; padding: 12px 14px; background: rgba(0,113,227,0.04); border-radius: 14px; border-left: 3px solid var(--accent-blue);">
            <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: #005bb8; margin-bottom: 4px; letter-spacing: 0.05em;">${r(e(`pathTab.journalPreviewLabel`))}</div>
            <p style="margin: 0; font-size: 0.9rem; line-height: 1.45; color: #002d5b; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${r(t.notes)}</p>
        </div>
    `:``,h=`
        <button type="button" class="path-card-collapse-btn" data-day-id="${r(t.id)}"
            aria-label="${r(e(`pathTab.toggleOptionsAria`,{title:f}))}" title="${r(e(`pathTab.toggleOptionsTitle`))}">
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
    `}function _(t,n,i,a){if(!t||!i)return``;let{isAnchor:o}=n,s=[];if(o?s.push(`<button class="path-primary-btn path-primary-btn--anchor path-checklist-btn" data-day-id="${r(t.id)}">${l(`checklist`,e(`pathTab.btnChecklist`))}</button>`):s.push(`<button class="path-primary-btn day-detail-btn" data-day-id="${r(t.id)}">${l(`plan`,e(`pathTab.btnOpenFullPlan`))}</button>`),a===t.id)s.push(`<button class="day-action-btn day-action-btn--success day-pin-save-btn" data-day-id="${r(t.id)}">${r(e(`pathTab.btnSavePin`))}</button>`),s.push(`<button class="day-action-btn day-action-btn--danger-fill day-pin-delete-btn" data-day-id="${r(t.id)}">${r(e(`pathTab.btnCancelPinEdit`))}</button>`);else{let n=t.lat?e(o?`pathTab.btnEditAnchorPin`:`pathTab.btnEditPin`):e(o?`pathTab.btnSetAnchorPin`:`pathTab.btnAddPin`);s.push(`<button class="day-action-btn day-action-btn--neutral day-pin-toggle-btn" data-day-id="${r(t.id)}">${l(`pin`,n)}</button>`)}return o?(s.push(`<button class="day-action-btn day-action-btn--neutral path-documents-btn" data-day-id="${r(t.id)}">${l(`document`,e(`pathTab.btnDocuments`))}</button>`),s.push(`<button class="day-action-btn day-action-btn--neutral path-photos-btn" data-day-id="${r(t.id)}">${l(`photo`,e(`pathTab.btnPhotos`))}</button>`)):(s.push(`<button class="day-action-btn day-action-btn--neutral day-journaling-btn" data-day-id="${r(t.id)}">${l(`journal`,e(`pathTab.btnJournaling`))}</button>`),s.push(`<button class="day-action-btn day-action-btn--danger day-delete-btn" data-day-id="${r(t.id)}">${l(`trash`,e(`pathTab.btnDeleteDay`))}</button>`)),`<div class="path-options-stack">${s.join(``)}</div>`}function v(t){let{activeTrip:a,tripDays:o,tripIsEditable:c,editingDayId:l}=t,u=[...o].sort((e,t)=>e.dayNumber-t.dayNumber),d=u.find(e=>e.dayNumber===0)||null,f=u.filter(e=>e.dayNumber>0),p=T(a,u),h=u.find(e=>e.id===p)||null;if(u.length===0)return`<div class="card glass" style="padding:28px; border-radius:18px; text-align:center; color:var(--text-secondary);">${r(e(`pathTab.emptyState`))}</div>`;let v=f.length,y=h?.dayNumber===0?i(`path.summaryHub`,v,{count:v}):h?e(`path.summaryDay`,{day:h.dayNumber,total:v}):i(`path.summaryNone`,v,{count:v}),b=s(),x=u.map(t=>{let i=t.id===p,a=t.dayNumber===0,o=!a&&t.date===b,s=`path-chip${a?` path-chip--anchor`:``}${o?` path-chip--today`:``}${i?` is-selected`:``}`,c=a?e(`pathTab.chipHubTooltip`):`${o?e(`pathTab.chipTodayPrefix`)+` · `:``}${e(`tripMedia.dayBucketDay`,{n:t.dayNumber})}${t.name?` — `+t.name:``}${t.date?` · `+(n(t.date)||t.date):``}`,l=a?`<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15 8.5 22 9.3 17 14.3 18.2 21.3 12 18 5.8 21.3 7 14.3 2 9.3 9 8.5"/></svg>`:String(t.dayNumber);return`<button type="button" class="${s}" data-path-chip-day-id="${r(t.id)}" title="${r(c)}" aria-label="${r(c)}" aria-pressed="${i}">${l}</button>`}).join(``),S=c?`<button type="button" class="path-chip path-chip--add" id="pathAddDayChip" title="${r(e(`pathTab.addNewDay`))}" aria-label="${r(e(`pathTab.addNewDay`))}">+</button>`:``,C=u.findIndex(e=>e.id===p),w=C<=0,E=C<0||C>=u.length-1,D=[];if(d){let e=h?.id===d.id,t=m(d.id);D.push(`
            <div class="path-column path-column--anchor${t?` is-collapsed`:``}">
                <div class="path-card path-card--anchor${e?` is-selected`:``}" data-day-id="${r(d.id)}">
                    ${g(d,{isAnchor:!0,isSelected:e},a)}
                </div>
                ${_(d,{isAnchor:!0},c,l)}
            </div>
        `)}if(h&&h.dayNumber>0){let e=m(h.id);D.push(`
            <div class="path-column path-column--selected${e?` is-collapsed`:``}">
                <div class="path-card path-card--selected" data-day-id="${r(h.id)}">
                    ${g(h,{isAnchor:!1,isSelected:!0},a)}
                </div>
                ${_(h,{isAnchor:!1},c,l)}
            </div>
        `)}let O=`path-cards-row${D.length===1?` path-cards-row--solo-anchor`:``}`;return`
        <div class="path-strip">
            <button type="button" class="path-nav-btn" id="pathPrevBtn" title="${r(e(`pathTab.previousDay`))}" aria-label="${r(e(`pathTab.previousDay`))}" ${w?`disabled`:``}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <div class="path-chips" role="group" aria-label="${r(e(`pathTab.tripDaysGroupAria`))}">
                ${x}
                ${S}
            </div>
            <button type="button" class="path-nav-btn" id="pathNextBtn" title="${r(e(`pathTab.nextDay`))}" aria-label="${r(e(`pathTab.nextDay`))}" ${E?`disabled`:``}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        </div>
        <div class="path-summary">${r(y)}</div>
        <div class="${O}">${D.join(``)}</div>
    `}var y={};try{let e=localStorage.getItem(`home_path_selected_day_by_trip`);e&&(y=JSON.parse(e)||{})}catch{y={}}var b={repaintPathTab:null,onSelectedDayChange:null};function x(e){`repaintPathTab`in e&&(b.repaintPathTab=e.repaintPathTab??null),`onSelectedDayChange`in e&&(b.onSelectedDayChange=e.onSelectedDayChange??null)}function S(e){return y[e]}function C(e){if(e in y){delete y[e];try{localStorage.setItem(`home_path_selected_day_by_trip`,JSON.stringify(y))}catch{}}}function w(e,n){if(!e||!n||y[e]===n)return;y[e]=n;try{localStorage.setItem(`home_path_selected_day_by_trip`,JSON.stringify(y))}catch{}if(typeof window<`u`&&typeof window.matchMedia==`function`&&window.matchMedia(`(max-width: 720px)`).matches){let r=(t.tripDays||[]).filter(t=>t.tripId===e),i=r.find(e=>e.id===n),a=r.find(e=>Number(e.dayNumber)===0);i&&Number(i.dayNumber)>0&&(a&&h(a.id,!0),h(i.id,!1))}if(typeof b.repaintPathTab==`function`&&b.repaintPathTab(),typeof b.onSelectedDayChange==`function`)try{b.onSelectedDayChange()}catch(e){console.warn(`[GG] onSelectedDayChange threw — likely stale home closure:`,e)}let r=window.activeMap;if(!r)return;let i=(t.tripDays||[]).find(e=>e.id===n);if(!i)return;let a=typeof i.lat==`number`?i.lat:null,o=typeof i.lng==`number`?i.lng:typeof i.lon==`number`?i.lon:null;try{if(a!=null&&o!=null)r.panTo({lat:a,lng:o}),typeof r.getZoom==`function`&&r.getZoom()<13&&r.setZoom(13);else if(i.dayNumber===0){let n=(t.trips||[]).find(t=>t.id===e);n&&typeof n.lat==`number`&&typeof n.lng==`number`&&r.panTo({lat:n.lat,lng:n.lng})}}catch{}}function T(e,t){if(!e||!t.length)return null;let n=y[e.id];if(n&&t.some(e=>e.id===n))return n;let r=s(),i=t.find(e=>e.dayNumber>0&&e.date===r);if(i)return i.id;let a=t.find(e=>e.dayNumber>0);return a?a.id:t[0].id}export{w as a,T as i,S as n,v as o,x as r,p as s,C as t};
//# sourceMappingURL=pathSelection-C_WWq9Zr.js.map