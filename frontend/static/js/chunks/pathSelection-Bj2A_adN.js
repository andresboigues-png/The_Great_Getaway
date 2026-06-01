import{C as e,Gt as t,Ht as n,Jt as r,Kt as i,Qt as a,Wt as o,sn as s,w as c}from"../app.bundle.js";var l=(e,r)=>`<span style="display:inline-flex;align-items:center;gap:6px;justify-content:center">${n(e)}${t(o(r))}</span>`,u=`home_path_card_collapsed_day_ids`;function d(){try{let e=localStorage.getItem(u);if(!e)return new Set;let t=JSON.parse(e);return new Set(Array.isArray(t)?t:[])}catch{return new Set}}function f(e){try{localStorage.setItem(u,JSON.stringify([...e]))}catch{}}function p(e){let t=d();return t.has(e)?(t.delete(e),f(t),!1):(t.add(e),f(t),!0)}function m(e){return d().has(e)}function h(e,t){let n=d(),r=n.has(e);t&&!r?(n.add(e),f(n)):!t&&r&&(n.delete(e),f(n))}function g(r,s,c){let{isAnchor:l,isSelected:u}=s,d=l?`<div style="background: var(--gradient-anchor-deep); color: white; width: 48px; height: 48px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(212,160,23,0.28);">
               <!-- 2026-05-21: replaced the anchor glyph with a 5-point
                    star to match the Trip Anchor → Trip Hub rename. -->
               <svg width="26" height="26" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">
                   <polygon points="12 2 15 8.5 22 9.3 17 14.3 18.2 21.3 12 18 5.8 21.3 7 14.3 2 9.3 9 8.5"/>
               </svg>
           </div>`:`<div style="background: var(--gradient-title); color: white; width: 48px; height: 48px; border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(0,113,227,0.15);">
               <span style="font-size: 0.6rem; font-weight: 800; text-transform: uppercase; opacity: 0.85; letter-spacing: 0.05em; line-height:1;">${t(e(`pathTab.dayBadgeLabel`))}</span>
               <span style="font-size: 1.25rem; font-weight: 800; line-height: 1.05;">${r.dayNumber}</span>
           </div>`,f=l?e(`pathTab.hubTitle`):t(r.name||e(`tripMedia.dayBucketDay`,{n:r.dayNumber})),p=[];if(l){p.push(c&&c.country?t(a(c.country)):t(e(`pathTab.hubSubtitleFallback`)));let i=(c.documents||[]).filter(e=>e.dayId===r.id),o=(c.photos||[]).filter(e=>e.dayId===r.id),s=i.length+(r.tickets||[]).length,l=o.length+(r.photos||[]).length;l&&p.push(`<span style="display:inline-flex; align-items:center; gap:4px; background:rgba(52,199,89,0.12); color:#1a6b3c; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:800;">${n(`photo`,{size:13})}${l}</span>`),s&&p.push(`<span style="display:inline-flex; align-items:center; gap:4px; background:rgba(88,86,214,0.12); color:#5856d6; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:800;">${n(`document`,{size:13})}${s}</span>`)}else p.push(`<button type="button" class="day-card__date-btn" data-day-id="${t(r.id)}" aria-label="${t(e(`pathTab.setDatePlaceholder`))}" style="display:inline-flex; align-items:center; gap:5px; background:none; border:none; padding:0; margin:0; font:inherit; color:inherit; cursor:pointer;">${n(`calendar`,{size:14})}${i(r.date)||e(`pathTab.setDatePlaceholder`)}</button>`),r.lat?p.push(`<span style="color: #005bb8;">${t(e(`pathTab.locationSet`))}</span>`):p.push(`<span class="day-card__pin-hint" style="display:inline-flex; align-items:center; gap:4px;">${n(`pinned`,{size:13})}${t(o(e(`pathTab.pinThisDay`)))}</span>`),r.date&&p.push(`<span class="day-card__weather" data-weather-date="${t(r.date)}"></span>`);let m=u&&r.notes&&!l?`
        <div style="margin-top: 12px; padding: 12px 14px; background: rgba(0,113,227,0.04); border-radius: 14px; border-left: 3px solid var(--accent-blue);">
            <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: #005bb8; margin-bottom: 4px; letter-spacing: 0.05em;">${t(e(`pathTab.journalPreviewLabel`))}</div>
            <p style="margin: 0; font-size: 0.9rem; line-height: 1.45; color: #002d5b; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${t(r.notes)}</p>
        </div>
    `:``,h=`
        <button type="button" class="path-card-collapse-btn" data-day-id="${t(r.id)}"
            aria-label="${t(e(`pathTab.toggleOptionsAria`,{title:f}))}" title="${t(e(`pathTab.toggleOptionsTitle`))}">
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
    `}function _(n,r,i,a){if(!n||!i)return``;let{isAnchor:o}=r,s=[];if(o?s.push(`<button class="path-primary-btn path-primary-btn--anchor path-checklist-btn" data-day-id="${t(n.id)}">${l(`checklist`,e(`pathTab.btnChecklist`))}</button>`):s.push(`<button class="path-primary-btn day-detail-btn" data-day-id="${t(n.id)}">${l(`plan`,e(`pathTab.btnOpenFullPlan`))}</button>`),a===n.id)s.push(`<button class="day-action-btn day-action-btn--success day-pin-save-btn" data-day-id="${t(n.id)}">${t(e(`pathTab.btnSavePin`))}</button>`),s.push(`<button class="day-action-btn day-action-btn--danger-fill day-pin-delete-btn" data-day-id="${t(n.id)}">${t(e(`pathTab.btnCancelPinEdit`))}</button>`);else{let r=n.lat?e(o?`pathTab.btnEditAnchorPin`:`pathTab.btnEditPin`):e(o?`pathTab.btnSetAnchorPin`:`pathTab.btnAddPin`);s.push(`<button class="day-action-btn day-action-btn--neutral day-pin-toggle-btn" data-day-id="${t(n.id)}">${l(`pin`,r)}</button>`)}return o?(s.push(`<button class="day-action-btn day-action-btn--neutral path-documents-btn" data-day-id="${t(n.id)}">${l(`document`,e(`pathTab.btnDocuments`))}</button>`),s.push(`<button class="day-action-btn day-action-btn--neutral path-photos-btn" data-day-id="${t(n.id)}">${l(`photo`,e(`pathTab.btnPhotos`))}</button>`)):(s.push(`<button class="day-action-btn day-action-btn--neutral day-journaling-btn" data-day-id="${t(n.id)}">${l(`journal`,e(`pathTab.btnJournaling`))}</button>`),s.push(`<button class="day-action-btn day-action-btn--danger day-delete-btn" data-day-id="${t(n.id)}">${l(`trash`,e(`pathTab.btnDeleteDay`))}</button>`)),`<div class="path-options-stack">${s.join(``)}</div>`}function v(n){let{activeTrip:a,tripDays:o,tripIsEditable:s,editingDayId:l}=n,u=[...o].sort((e,t)=>e.dayNumber-t.dayNumber),d=u.find(e=>e.dayNumber===0)||null,f=u.filter(e=>e.dayNumber>0),p=T(a,u),h=u.find(e=>e.id===p)||null;if(u.length===0)return`<div class="card glass" style="padding:28px; border-radius:18px; text-align:center; color:var(--text-secondary);">${t(e(`pathTab.emptyState`))}</div>`;let v=f.length,y=h?.dayNumber===0?c(`path.summaryHub`,v,{count:v}):h?e(`path.summaryDay`,{day:h.dayNumber,total:v}):c(`path.summaryNone`,v,{count:v}),b=r(),x=u.map(n=>{let r=n.id===p,a=n.dayNumber===0,o=!a&&n.date===b,s=`path-chip${a?` path-chip--anchor`:``}${o?` path-chip--today`:``}${r?` is-selected`:``}`,c=a?e(`pathTab.chipHubTooltip`):`${o?e(`pathTab.chipTodayPrefix`)+` · `:``}${e(`tripMedia.dayBucketDay`,{n:n.dayNumber})}${n.name?` — `+n.name:``}${n.date?` · `+(i(n.date)||n.date):``}`,l=a?`<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15 8.5 22 9.3 17 14.3 18.2 21.3 12 18 5.8 21.3 7 14.3 2 9.3 9 8.5"/></svg>`:String(n.dayNumber);return`<button type="button" class="${s}" data-path-chip-day-id="${t(n.id)}" title="${t(c)}" aria-label="${t(c)}" aria-pressed="${r}">${l}</button>`}).join(``),S=s?`<button type="button" class="path-chip path-chip--add" id="pathAddDayChip" title="${t(e(`pathTab.addNewDay`))}" aria-label="${t(e(`pathTab.addNewDay`))}">+</button>`:``,C=u.findIndex(e=>e.id===p),w=C<=0,E=C<0||C>=u.length-1,D=[];if(d){let e=h?.id===d.id,n=m(d.id);D.push(`
            <div class="path-column path-column--anchor${n?` is-collapsed`:``}">
                <div class="path-card path-card--anchor${e?` is-selected`:``}" data-day-id="${t(d.id)}">
                    ${g(d,{isAnchor:!0,isSelected:e},a)}
                </div>
                ${_(d,{isAnchor:!0},s,l)}
            </div>
        `)}if(h&&h.dayNumber>0){let e=m(h.id);D.push(`
            <div class="path-column path-column--selected${e?` is-collapsed`:``}">
                <div class="path-card path-card--selected" data-day-id="${t(h.id)}">
                    ${g(h,{isAnchor:!1,isSelected:!0},a)}
                </div>
                ${_(h,{isAnchor:!1},s,l)}
            </div>
        `)}let O=`path-cards-row${D.length===1?` path-cards-row--solo-anchor`:``}`;return`
        <div class="path-strip">
            <button type="button" class="path-nav-btn" id="pathPrevBtn" title="${t(e(`pathTab.previousDay`))}" aria-label="${t(e(`pathTab.previousDay`))}" ${w?`disabled`:``}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <div class="path-chips" role="group" aria-label="${t(e(`pathTab.tripDaysGroupAria`))}">
                ${x}
                ${S}
            </div>
            <button type="button" class="path-nav-btn" id="pathNextBtn" title="${t(e(`pathTab.nextDay`))}" aria-label="${t(e(`pathTab.nextDay`))}" ${E?`disabled`:``}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        </div>
        <div class="path-summary">${t(y)}</div>
        <div class="${O}">${D.join(``)}</div>
    `}var y={};try{let e=localStorage.getItem(`home_path_selected_day_by_trip`);e&&(y=JSON.parse(e)||{})}catch{y={}}var b={repaintPathTab:null,onSelectedDayChange:null};function x(e){`repaintPathTab`in e&&(b.repaintPathTab=e.repaintPathTab??null),`onSelectedDayChange`in e&&(b.onSelectedDayChange=e.onSelectedDayChange??null)}function S(e){return y[e]}function C(e){if(e in y){delete y[e];try{localStorage.setItem(`home_path_selected_day_by_trip`,JSON.stringify(y))}catch{}}}function w(e,t){if(!e||!t||y[e]===t)return;y[e]=t;try{localStorage.setItem(`home_path_selected_day_by_trip`,JSON.stringify(y))}catch{}if(typeof window<`u`&&typeof window.matchMedia==`function`&&window.matchMedia(`(max-width: 720px)`).matches){let n=(s.tripDays||[]).filter(t=>t.tripId===e),r=n.find(e=>e.id===t),i=n.find(e=>Number(e.dayNumber)===0);r&&Number(r.dayNumber)>0&&(i&&h(i.id,!0),h(r.id,!1))}if(typeof b.repaintPathTab==`function`&&b.repaintPathTab(),typeof b.onSelectedDayChange==`function`)try{b.onSelectedDayChange()}catch(e){console.warn(`[GG] onSelectedDayChange threw — likely stale home closure:`,e)}let n=window.activeMap;if(!n)return;let r=(s.tripDays||[]).find(e=>e.id===t);if(!r)return;let i=typeof r.lat==`number`?r.lat:null,a=typeof r.lng==`number`?r.lng:typeof r.lon==`number`?r.lon:null;try{if(i!=null&&a!=null)n.panTo({lat:i,lng:a}),typeof n.getZoom==`function`&&n.getZoom()<13&&n.setZoom(13);else if(r.dayNumber===0){let t=(s.trips||[]).find(t=>t.id===e);t&&typeof t.lat==`number`&&typeof t.lng==`number`&&n.panTo({lat:t.lat,lng:t.lng})}}catch{}}function T(e,t){if(!e||!t.length)return null;let n=y[e.id];if(n&&t.some(e=>e.id===n))return n;let i=r(),a=t.find(e=>e.dayNumber>0&&e.date===i);if(a)return a.id;let o=t.find(e=>e.dayNumber>0);return o?o.id:t[0].id}export{w as a,T as i,S as n,v as o,x as r,p as s,C as t};
//# sourceMappingURL=pathSelection-Bj2A_adN.js.map