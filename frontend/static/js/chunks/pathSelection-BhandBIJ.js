import{Dt as e,Et as t,Mt as n,Ut as r,b as i,y as a}from"../app.bundle.js";var o=`home_path_card_collapsed_day_ids`;function s(){try{let e=localStorage.getItem(o);if(!e)return new Set;let t=JSON.parse(e);return new Set(Array.isArray(t)?t:[])}catch{return new Set}}function c(e){try{localStorage.setItem(o,JSON.stringify([...e]))}catch{}}function l(e){let t=s();return t.has(e)?(t.delete(e),c(t),!1):(t.add(e),c(t),!0)}function u(e){return s().has(e)}function d(e,t){let n=s(),r=n.has(e);t&&!r?(n.add(e),c(n)):!t&&r&&(n.delete(e),c(n))}function f(r,i,a){let{isAnchor:o,isSelected:s}=i,c=o?`<div style="background: var(--gradient-anchor-deep); color: white; width: 48px; height: 48px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(212,160,23,0.28);">
               <!-- 2026-05-21: replaced the anchor glyph with a 5-point
                    star to match the Trip Anchor → Trip Hub rename. -->
               <svg width="26" height="26" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">
                   <polygon points="12 2 15 8.5 22 9.3 17 14.3 18.2 21.3 12 18 5.8 21.3 7 14.3 2 9.3 9 8.5"/>
               </svg>
           </div>`:`<div style="background: var(--gradient-title); color: white; width: 48px; height: 48px; border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(0,113,227,0.15);">
               <span style="font-size: 0.6rem; font-weight: 800; text-transform: uppercase; opacity: 0.85; letter-spacing: 0.05em; line-height:1;">Day</span>
               <span style="font-size: 1.25rem; font-weight: 800; line-height: 1.05;">${r.dayNumber}</span>
           </div>`,l=o?`Trip Hub`:t(r.name||`Day ${r.dayNumber}`),u=[];if(o){u.push(a&&a.country?t(n(a.country)):`Where the trip begins`);let e=(a.documents||[]).filter(e=>e.dayId===r.id),i=(a.photos||[]).filter(e=>e.dayId===r.id),o=e.length+(r.tickets||[]).length,s=i.length+(r.photos||[]).length;s&&u.push(`<span style="background:rgba(52,199,89,0.12); color:#1a6b3c; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:800;">📸 ${s}</span>`),o&&u.push(`<span style="background:rgba(88,86,214,0.12); color:#5856d6; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:800;">📎 ${o}</span>`)}else u.push(`📅 ${e(r.date)||`Set date`}`),r.lat?u.push(`<span style="color: #005bb8;">📍 Location set</span>`):u.push(`<span class="day-card__pin-hint">📌 Pin this day</span>`),r.date&&u.push(`<span class="day-card__weather" data-weather-date="${t(r.date)}"></span>`);let d=s&&r.notes&&!o?`
        <div style="margin-top: 12px; padding: 12px 14px; background: rgba(0,113,227,0.04); border-radius: 14px; border-left: 3px solid var(--accent-blue);">
            <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: #005bb8; margin-bottom: 4px; letter-spacing: 0.05em;">Journal preview</div>
            <p style="margin: 0; font-size: 0.9rem; line-height: 1.45; color: #002d5b; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${t(r.notes)}</p>
        </div>
    `:``,f=`
        <button type="button" class="path-card-collapse-btn" data-day-id="${t(r.id)}"
            aria-label="Toggle options for ${t(l)}" title="Hide / show options">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="6 15 12 9 18 15"></polyline>
            </svg>
        </button>
    `;return`
        <div style="display:flex; align-items:center; gap:14px;">
            ${c}
            <div style="flex:1; min-width:0;">
                <h3 style="margin:0; font-size:${o?`1.05rem`:`1.25rem`}; font-weight:800; color:var(--text-brand-navy); letter-spacing:-0.02em; line-height:1.2; ${o?`overflow:hidden; text-overflow:ellipsis; white-space:nowrap;`:``}">${l}</h3>
                <div style="font-size:0.82rem; color:var(--text-secondary); font-weight:600; margin-top:4px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    ${u.map(e=>`<span>${e}</span>`).join(`<span style="opacity:0.4;">·</span>`)}
                </div>
            </div>
            ${f}
        </div>
        ${d}
    `}function p(e,n,r,i){if(!e||!r)return``;let{isAnchor:a}=n,o=[];if(a?o.push(`<button class="path-primary-btn path-primary-btn--anchor path-checklist-btn" data-day-id="${t(e.id)}">📝 Trip checklist</button>`):o.push(`<button class="path-primary-btn day-detail-btn" data-day-id="${t(e.id)}">📋 Open Full Plan</button>`),i===e.id)o.push(`<button class="day-action-btn day-action-btn--success day-pin-save-btn" data-day-id="${t(e.id)}">Save pin</button>`),o.push(`<button class="day-action-btn day-action-btn--danger-fill day-pin-delete-btn" data-day-id="${t(e.id)}">Cancel pin edit</button>`);else{let n=e.lat?a?`📍 Edit anchor pin`:`📍 Edit pin`:a?`📍 Set anchor pin`:`📍 Add pin`;o.push(`<button class="day-action-btn day-action-btn--neutral day-pin-toggle-btn" data-day-id="${t(e.id)}"><span>${n}</span></button>`)}return a?(o.push(`<button class="day-action-btn day-action-btn--neutral path-documents-btn" data-day-id="${t(e.id)}"><span>📎 Documents</span></button>`),o.push(`<button class="day-action-btn day-action-btn--neutral path-photos-btn" data-day-id="${t(e.id)}"><span>📸 Photos</span></button>`)):(o.push(`<button class="day-action-btn day-action-btn--neutral day-journaling-btn" data-day-id="${t(e.id)}"><span>✍️ Journaling</span></button>`),o.push(`<button class="day-action-btn day-action-btn--danger day-delete-btn" data-day-id="${t(e.id)}"><span>🗑️ Delete day</span></button>`)),`<div class="path-options-stack">${o.join(``)}</div>`}function m(n){let{activeTrip:r,tripDays:o,tripIsEditable:s,editingDayId:c}=n,l=[...o].sort((e,t)=>e.dayNumber-t.dayNumber),d=l.find(e=>e.dayNumber===0)||null,m=l.filter(e=>e.dayNumber>0),h=x(r,l),g=l.find(e=>e.id===h)||null;if(l.length===0)return`<div class="card glass" style="padding:28px; border-radius:18px; text-align:center; color:var(--text-secondary);">No days yet — create some.</div>`;let _=m.length,v=g?.dayNumber===0?i(`path.summaryHub`,_,{count:_}):g?a(`path.summaryDay`,{day:g.dayNumber,total:_}):i(`path.summaryNone`,_,{count:_}),y=(()=>{let e=new Date;return`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,`0`)}-${String(e.getDate()).padStart(2,`0`)}`})(),b=l.map(n=>{let r=n.id===h,i=n.dayNumber===0,a=!i&&n.date===y,o=`path-chip${i?` path-chip--anchor`:``}${a?` path-chip--today`:``}${r?` is-selected`:``}`,s=i?`Trip Hub — your trip's home base`:`${a?`Today · `:``}Day ${n.dayNumber}${n.name?` — `+n.name:``}${n.date?` · `+(e(n.date)||n.date):``}`,c=i?`<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15 8.5 22 9.3 17 14.3 18.2 21.3 12 18 5.8 21.3 7 14.3 2 9.3 9 8.5"/></svg>`:String(n.dayNumber);return`<button type="button" class="${o}" data-path-chip-day-id="${t(n.id)}" title="${t(s)}" aria-label="${t(s)}" aria-pressed="${r}">${c}</button>`}).join(``),S=s?`<button type="button" class="path-chip path-chip--add" id="pathAddDayChip" title="Add a new day" aria-label="Add a new day">+</button>`:``,C=l.findIndex(e=>e.id===h),w=C<=0,T=C<0||C>=l.length-1,E=[];if(d){let e=g?.id===d.id,n=u(d.id);E.push(`
            <div class="path-column path-column--anchor${n?` is-collapsed`:``}">
                <div class="path-card path-card--anchor${e?` is-selected`:``}" data-day-id="${t(d.id)}">
                    ${f(d,{isAnchor:!0,isSelected:e},r)}
                </div>
                ${p(d,{isAnchor:!0},s,c)}
            </div>
        `)}if(g&&g.dayNumber>0){let e=u(g.id);E.push(`
            <div class="path-column path-column--selected${e?` is-collapsed`:``}">
                <div class="path-card path-card--selected" data-day-id="${t(g.id)}">
                    ${f(g,{isAnchor:!1,isSelected:!0},r)}
                </div>
                ${p(g,{isAnchor:!1},s,c)}
            </div>
        `)}let D=`path-cards-row${E.length===1?` path-cards-row--solo-anchor`:``}`;return`
        <div class="path-strip">
            <button type="button" class="path-nav-btn" id="pathPrevBtn" title="Previous day" aria-label="Previous day" ${w?`disabled`:``}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <div class="path-chips" role="group" aria-label="Trip days">
                ${b}
                ${S}
            </div>
            <button type="button" class="path-nav-btn" id="pathNextBtn" title="Next day" aria-label="Next day" ${T?`disabled`:``}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        </div>
        <div class="path-summary">${t(v)}</div>
        <div class="${D}">${E.join(``)}</div>
    `}var h={};try{let e=localStorage.getItem(`home_path_selected_day_by_trip`);e&&(h=JSON.parse(e)||{})}catch{h={}}var g={repaintPathTab:null,onSelectedDayChange:null};function _(e){`repaintPathTab`in e&&(g.repaintPathTab=e.repaintPathTab??null),`onSelectedDayChange`in e&&(g.onSelectedDayChange=e.onSelectedDayChange??null)}function v(e){return h[e]}function y(e){if(e in h){delete h[e];try{localStorage.setItem(`home_path_selected_day_by_trip`,JSON.stringify(h))}catch{}}}function b(e,t){if(!e||!t||h[e]===t)return;h[e]=t;try{localStorage.setItem(`home_path_selected_day_by_trip`,JSON.stringify(h))}catch{}if(typeof window<`u`&&typeof window.matchMedia==`function`&&window.matchMedia(`(max-width: 720px)`).matches){let n=(r.tripDays||[]).filter(t=>t.tripId===e),i=n.find(e=>e.id===t),a=n.find(e=>Number(e.dayNumber)===0);i&&Number(i.dayNumber)>0&&(a&&d(a.id,!0),d(i.id,!1))}if(typeof g.repaintPathTab==`function`&&g.repaintPathTab(),typeof g.onSelectedDayChange==`function`)try{g.onSelectedDayChange()}catch(e){console.warn(`[GG] onSelectedDayChange threw — likely stale home closure:`,e)}let n=window.activeMap;if(!n)return;let i=(r.tripDays||[]).find(e=>e.id===t);if(!i)return;let a=typeof i.lat==`number`?i.lat:null,o=typeof i.lng==`number`?i.lng:typeof i.lon==`number`?i.lon:null;try{if(a!=null&&o!=null)n.panTo({lat:a,lng:o}),typeof n.getZoom==`function`&&n.getZoom()<13&&n.setZoom(13);else if(i.dayNumber===0){let t=(r.trips||[]).find(t=>t.id===e);t&&typeof t.lat==`number`&&typeof t.lng==`number`&&n.panTo({lat:t.lat,lng:t.lng})}}catch{}}function x(e,t){if(!e||!t.length)return null;let n=h[e.id];if(n&&t.some(e=>e.id===n))return n;let r=new Date().toISOString().slice(0,10),i=t.find(e=>e.dayNumber>0&&e.date===r);if(i)return i.id;let a=t.find(e=>e.dayNumber>0);return a?a.id:t[0].id}export{b as a,x as i,v as n,m as o,_ as r,l as s,y as t};
//# sourceMappingURL=pathSelection-BhandBIJ.js.map