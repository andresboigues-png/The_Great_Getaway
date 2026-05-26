import{Lt as e,Mt as t,Wt as n,b as r,jt as i,y as a}from"../app.bundle.js";var o=`home_path_card_collapsed_day_ids`;function s(){try{let e=localStorage.getItem(o);if(!e)return new Set;let t=JSON.parse(e);return new Set(Array.isArray(t)?t:[])}catch{return new Set}}function c(e){try{localStorage.setItem(o,JSON.stringify([...e]))}catch{}}function l(e){let t=s();return t.has(e)?(t.delete(e),c(t),!1):(t.add(e),c(t),!0)}function u(e){return s().has(e)}function d(e,t){let n=s(),r=n.has(e);t&&!r?(n.add(e),c(n)):!t&&r&&(n.delete(e),c(n))}function f(n,r,o){let{isAnchor:s,isSelected:c}=r,l=s?`<div style="background: var(--gradient-anchor-deep); color: white; width: 48px; height: 48px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(212,160,23,0.28);">
               <!-- 2026-05-21: replaced the anchor glyph with a 5-point
                    star to match the Trip Anchor → Trip Hub rename. -->
               <svg width="26" height="26" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">
                   <polygon points="12 2 15 8.5 22 9.3 17 14.3 18.2 21.3 12 18 5.8 21.3 7 14.3 2 9.3 9 8.5"/>
               </svg>
           </div>`:`<div style="background: var(--gradient-title); color: white; width: 48px; height: 48px; border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(0,113,227,0.15);">
               <span style="font-size: 0.6rem; font-weight: 800; text-transform: uppercase; opacity: 0.85; letter-spacing: 0.05em; line-height:1;">${i(a(`pathTab.dayBadgeLabel`))}</span>
               <span style="font-size: 1.25rem; font-weight: 800; line-height: 1.05;">${n.dayNumber}</span>
           </div>`,u=s?a(`pathTab.hubTitle`):i(n.name||a(`tripMedia.dayBucketDay`,{n:n.dayNumber})),d=[];if(s){d.push(o&&o.country?i(e(o.country)):i(a(`pathTab.hubSubtitleFallback`)));let t=(o.documents||[]).filter(e=>e.dayId===n.id),r=(o.photos||[]).filter(e=>e.dayId===n.id),s=t.length+(n.tickets||[]).length,c=r.length+(n.photos||[]).length;c&&d.push(`<span style="background:rgba(52,199,89,0.12); color:#1a6b3c; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:800;">📸 ${c}</span>`),s&&d.push(`<span style="background:rgba(88,86,214,0.12); color:#5856d6; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:800;">📎 ${s}</span>`)}else d.push(`📅 ${t(n.date)||a(`pathTab.setDatePlaceholder`)}`),n.lat?d.push(`<span style="color: #005bb8;">${i(a(`pathTab.locationSet`))}</span>`):d.push(`<span class="day-card__pin-hint">${i(a(`pathTab.pinThisDay`))}</span>`),n.date&&d.push(`<span class="day-card__weather" data-weather-date="${i(n.date)}"></span>`);let f=c&&n.notes&&!s?`
        <div style="margin-top: 12px; padding: 12px 14px; background: rgba(0,113,227,0.04); border-radius: 14px; border-left: 3px solid var(--accent-blue);">
            <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: #005bb8; margin-bottom: 4px; letter-spacing: 0.05em;">${i(a(`pathTab.journalPreviewLabel`))}</div>
            <p style="margin: 0; font-size: 0.9rem; line-height: 1.45; color: #002d5b; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${i(n.notes)}</p>
        </div>
    `:``,p=`
        <button type="button" class="path-card-collapse-btn" data-day-id="${i(n.id)}"
            aria-label="${i(a(`pathTab.toggleOptionsAria`,{title:u}))}" title="${i(a(`pathTab.toggleOptionsTitle`))}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="6 15 12 9 18 15"></polyline>
            </svg>
        </button>
    `;return`
        <div style="display:flex; align-items:center; gap:14px;">
            ${l}
            <div style="flex:1; min-width:0;">
                <h3 style="margin:0; font-size:${s?`1.05rem`:`1.25rem`}; font-weight:800; color:var(--text-brand-navy); letter-spacing:-0.02em; line-height:1.2; ${s?`overflow:hidden; text-overflow:ellipsis; white-space:nowrap;`:``}">${u}</h3>
                <div style="font-size:0.82rem; color:var(--text-secondary); font-weight:600; margin-top:4px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    ${d.map(e=>`<span>${e}</span>`).join(`<span style="opacity:0.4;">·</span>`)}
                </div>
            </div>
            ${p}
        </div>
        ${f}
    `}function p(e,t,n,r){if(!e||!n)return``;let{isAnchor:o}=t,s=[];if(o?s.push(`<button class="path-primary-btn path-primary-btn--anchor path-checklist-btn" data-day-id="${i(e.id)}">${i(a(`pathTab.btnChecklist`))}</button>`):s.push(`<button class="path-primary-btn day-detail-btn" data-day-id="${i(e.id)}">${i(a(`pathTab.btnOpenFullPlan`))}</button>`),r===e.id)s.push(`<button class="day-action-btn day-action-btn--success day-pin-save-btn" data-day-id="${i(e.id)}">${i(a(`pathTab.btnSavePin`))}</button>`),s.push(`<button class="day-action-btn day-action-btn--danger-fill day-pin-delete-btn" data-day-id="${i(e.id)}">${i(a(`pathTab.btnCancelPinEdit`))}</button>`);else{let t=e.lat?a(o?`pathTab.btnEditAnchorPin`:`pathTab.btnEditPin`):a(o?`pathTab.btnSetAnchorPin`:`pathTab.btnAddPin`);s.push(`<button class="day-action-btn day-action-btn--neutral day-pin-toggle-btn" data-day-id="${i(e.id)}"><span>${i(t)}</span></button>`)}return o?(s.push(`<button class="day-action-btn day-action-btn--neutral path-documents-btn" data-day-id="${i(e.id)}"><span>${i(a(`pathTab.btnDocuments`))}</span></button>`),s.push(`<button class="day-action-btn day-action-btn--neutral path-photos-btn" data-day-id="${i(e.id)}"><span>${i(a(`pathTab.btnPhotos`))}</span></button>`)):(s.push(`<button class="day-action-btn day-action-btn--neutral day-journaling-btn" data-day-id="${i(e.id)}"><span>${i(a(`pathTab.btnJournaling`))}</span></button>`),s.push(`<button class="day-action-btn day-action-btn--danger day-delete-btn" data-day-id="${i(e.id)}"><span>${i(a(`pathTab.btnDeleteDay`))}</span></button>`)),`<div class="path-options-stack">${s.join(``)}</div>`}function m(e){let{activeTrip:n,tripDays:o,tripIsEditable:s,editingDayId:c}=e,l=[...o].sort((e,t)=>e.dayNumber-t.dayNumber),d=l.find(e=>e.dayNumber===0)||null,m=l.filter(e=>e.dayNumber>0),h=x(n,l),g=l.find(e=>e.id===h)||null;if(l.length===0)return`<div class="card glass" style="padding:28px; border-radius:18px; text-align:center; color:var(--text-secondary);">${i(a(`pathTab.emptyState`))}</div>`;let _=m.length,v=g?.dayNumber===0?r(`path.summaryHub`,_,{count:_}):g?a(`path.summaryDay`,{day:g.dayNumber,total:_}):r(`path.summaryNone`,_,{count:_}),y=(()=>{let e=new Date;return`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,`0`)}-${String(e.getDate()).padStart(2,`0`)}`})(),b=l.map(e=>{let n=e.id===h,r=e.dayNumber===0,o=!r&&e.date===y,s=`path-chip${r?` path-chip--anchor`:``}${o?` path-chip--today`:``}${n?` is-selected`:``}`,c=r?a(`pathTab.chipHubTooltip`):`${o?a(`pathTab.chipTodayPrefix`)+` · `:``}${a(`tripMedia.dayBucketDay`,{n:e.dayNumber})}${e.name?` — `+e.name:``}${e.date?` · `+(t(e.date)||e.date):``}`,l=r?`<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15 8.5 22 9.3 17 14.3 18.2 21.3 12 18 5.8 21.3 7 14.3 2 9.3 9 8.5"/></svg>`:String(e.dayNumber);return`<button type="button" class="${s}" data-path-chip-day-id="${i(e.id)}" title="${i(c)}" aria-label="${i(c)}" aria-pressed="${n}">${l}</button>`}).join(``),S=s?`<button type="button" class="path-chip path-chip--add" id="pathAddDayChip" title="${i(a(`pathTab.addNewDay`))}" aria-label="${i(a(`pathTab.addNewDay`))}">+</button>`:``,C=l.findIndex(e=>e.id===h),w=C<=0,T=C<0||C>=l.length-1,E=[];if(d){let e=g?.id===d.id,t=u(d.id);E.push(`
            <div class="path-column path-column--anchor${t?` is-collapsed`:``}">
                <div class="path-card path-card--anchor${e?` is-selected`:``}" data-day-id="${i(d.id)}">
                    ${f(d,{isAnchor:!0,isSelected:e},n)}
                </div>
                ${p(d,{isAnchor:!0},s,c)}
            </div>
        `)}if(g&&g.dayNumber>0){let e=u(g.id);E.push(`
            <div class="path-column path-column--selected${e?` is-collapsed`:``}">
                <div class="path-card path-card--selected" data-day-id="${i(g.id)}">
                    ${f(g,{isAnchor:!1,isSelected:!0},n)}
                </div>
                ${p(g,{isAnchor:!1},s,c)}
            </div>
        `)}let D=`path-cards-row${E.length===1?` path-cards-row--solo-anchor`:``}`;return`
        <div class="path-strip">
            <button type="button" class="path-nav-btn" id="pathPrevBtn" title="${i(a(`pathTab.previousDay`))}" aria-label="${i(a(`pathTab.previousDay`))}" ${w?`disabled`:``}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <div class="path-chips" role="group" aria-label="${i(a(`pathTab.tripDaysGroupAria`))}">
                ${b}
                ${S}
            </div>
            <button type="button" class="path-nav-btn" id="pathNextBtn" title="${i(a(`pathTab.nextDay`))}" aria-label="${i(a(`pathTab.nextDay`))}" ${T?`disabled`:``}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        </div>
        <div class="path-summary">${i(v)}</div>
        <div class="${D}">${E.join(``)}</div>
    `}var h={};try{let e=localStorage.getItem(`home_path_selected_day_by_trip`);e&&(h=JSON.parse(e)||{})}catch{h={}}var g={repaintPathTab:null,onSelectedDayChange:null};function _(e){`repaintPathTab`in e&&(g.repaintPathTab=e.repaintPathTab??null),`onSelectedDayChange`in e&&(g.onSelectedDayChange=e.onSelectedDayChange??null)}function v(e){return h[e]}function y(e){if(e in h){delete h[e];try{localStorage.setItem(`home_path_selected_day_by_trip`,JSON.stringify(h))}catch{}}}function b(e,t){if(!e||!t||h[e]===t)return;h[e]=t;try{localStorage.setItem(`home_path_selected_day_by_trip`,JSON.stringify(h))}catch{}if(typeof window<`u`&&typeof window.matchMedia==`function`&&window.matchMedia(`(max-width: 720px)`).matches){let r=(n.tripDays||[]).filter(t=>t.tripId===e),i=r.find(e=>e.id===t),a=r.find(e=>Number(e.dayNumber)===0);i&&Number(i.dayNumber)>0&&(a&&d(a.id,!0),d(i.id,!1))}if(typeof g.repaintPathTab==`function`&&g.repaintPathTab(),typeof g.onSelectedDayChange==`function`)try{g.onSelectedDayChange()}catch(e){console.warn(`[GG] onSelectedDayChange threw — likely stale home closure:`,e)}let r=window.activeMap;if(!r)return;let i=(n.tripDays||[]).find(e=>e.id===t);if(!i)return;let a=typeof i.lat==`number`?i.lat:null,o=typeof i.lng==`number`?i.lng:typeof i.lon==`number`?i.lon:null;try{if(a!=null&&o!=null)r.panTo({lat:a,lng:o}),typeof r.getZoom==`function`&&r.getZoom()<13&&r.setZoom(13);else if(i.dayNumber===0){let t=(n.trips||[]).find(t=>t.id===e);t&&typeof t.lat==`number`&&typeof t.lng==`number`&&r.panTo({lat:t.lat,lng:t.lng})}}catch{}}function x(e,t){if(!e||!t.length)return null;let n=h[e.id];if(n&&t.some(e=>e.id===n))return n;let r=new Date().toISOString().slice(0,10),i=t.find(e=>e.dayNumber>0&&e.date===r);if(i)return i.id;let a=t.find(e=>e.dayNumber>0);return a?a.id:t[0].id}export{b as a,x as i,v as n,m as o,_ as r,l as s,y as t};
//# sourceMappingURL=pathSelection-0-ku5rds.js.map