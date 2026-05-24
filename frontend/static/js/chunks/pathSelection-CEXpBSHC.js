import{Dt as e,Et as t,Mt as n,Ut as r}from"../app.bundle.js";var i=`home_path_card_collapsed_day_ids`;function a(){try{let e=localStorage.getItem(i);if(!e)return new Set;let t=JSON.parse(e);return new Set(Array.isArray(t)?t:[])}catch{return new Set}}function o(e){try{localStorage.setItem(i,JSON.stringify([...e]))}catch{}}function s(e){let t=a();return t.has(e)?(t.delete(e),o(t),!1):(t.add(e),o(t),!0)}function c(e){return a().has(e)}function l(e,t){let n=a(),r=n.has(e);t&&!r?(n.add(e),o(n)):!t&&r&&(n.delete(e),o(n))}function u(r,i,a){let{isAnchor:o,isSelected:s}=i,c=o?`<div style="background: var(--gradient-anchor-deep); color: white; width: 48px; height: 48px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; flex-shrink:0; box-shadow: 0 8px 18px rgba(212,160,23,0.28);">
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
    `}function d(e,n,r,i){if(!e||!r)return``;let{isAnchor:a}=n,o=[];if(a?o.push(`<button class="path-primary-btn path-primary-btn--anchor path-checklist-btn" data-day-id="${t(e.id)}">📝 Trip checklist</button>`):o.push(`<button class="path-primary-btn day-detail-btn" data-day-id="${t(e.id)}">📋 Open Full Plan</button>`),i===e.id)o.push(`<button class="day-action-btn day-action-btn--success day-pin-save-btn" data-day-id="${t(e.id)}">Save pin</button>`),o.push(`<button class="day-action-btn day-action-btn--danger-fill day-pin-delete-btn" data-day-id="${t(e.id)}">Cancel pin edit</button>`);else{let n=e.lat?a?`📍 Edit anchor pin`:`📍 Edit pin`:a?`📍 Set anchor pin`:`📍 Add pin`;o.push(`<button class="day-action-btn day-action-btn--neutral day-pin-toggle-btn" data-day-id="${t(e.id)}"><span>${n}</span></button>`)}return a?(o.push(`<button class="day-action-btn day-action-btn--neutral path-documents-btn" data-day-id="${t(e.id)}"><span>📎 Documents</span></button>`),o.push(`<button class="day-action-btn day-action-btn--neutral path-photos-btn" data-day-id="${t(e.id)}"><span>📸 Photos</span></button>`)):(o.push(`<button class="day-action-btn day-action-btn--neutral day-journaling-btn" data-day-id="${t(e.id)}"><span>✍️ Journaling</span></button>`),o.push(`<button class="day-action-btn day-action-btn--danger day-delete-btn" data-day-id="${t(e.id)}"><span>🗑️ Delete day</span></button>`)),`<div class="path-options-stack">${o.join(``)}</div>`}function f(n){let{activeTrip:r,tripDays:i,tripIsEditable:a,editingDayId:o}=n,s=[...i].sort((e,t)=>e.dayNumber-t.dayNumber),l=s.find(e=>e.dayNumber===0)||null,f=s.filter(e=>e.dayNumber>0),p=y(r,s),m=s.find(e=>e.id===p)||null;if(s.length===0)return`<div class="card glass" style="padding:28px; border-radius:18px; text-align:center; color:var(--text-secondary);">No days yet — create some.</div>`;let h=f.length,g=m?.dayNumber===0?`Trip Hub · ${h} day${h===1?``:`s`} planned`:m?`Day ${m.dayNumber} of ${h}`:`${h} day${h===1?``:`s`} planned`,_=(()=>{let e=new Date;return`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,`0`)}-${String(e.getDate()).padStart(2,`0`)}`})(),v=s.map(n=>{let r=n.id===p,i=n.dayNumber===0,a=!i&&n.date===_,o=`path-chip${i?` path-chip--anchor`:``}${a?` path-chip--today`:``}${r?` is-selected`:``}`,s=i?`Trip Hub — your trip's home base`:`${a?`Today · `:``}Day ${n.dayNumber}${n.name?` — `+n.name:``}${n.date?` · `+(e(n.date)||n.date):``}`,c=i?`<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15 8.5 22 9.3 17 14.3 18.2 21.3 12 18 5.8 21.3 7 14.3 2 9.3 9 8.5"/></svg>`:String(n.dayNumber);return`<button type="button" class="${o}" data-path-chip-day-id="${t(n.id)}" title="${t(s)}" aria-label="${t(s)}" aria-pressed="${r}">${c}</button>`}).join(``),b=a?`<button type="button" class="path-chip path-chip--add" id="pathAddDayChip" title="Add a new day" aria-label="Add a new day">+</button>`:``,x=s.findIndex(e=>e.id===p),S=x<=0,C=x<0||x>=s.length-1,w=[];if(l){let e=m?.id===l.id,n=c(l.id);w.push(`
            <div class="path-column path-column--anchor${n?` is-collapsed`:``}">
                <div class="path-card path-card--anchor${e?` is-selected`:``}" data-day-id="${t(l.id)}">
                    ${u(l,{isAnchor:!0,isSelected:e},r)}
                </div>
                ${d(l,{isAnchor:!0},a,o)}
            </div>
        `)}if(m&&m.dayNumber>0){let e=c(m.id);w.push(`
            <div class="path-column path-column--selected${e?` is-collapsed`:``}">
                <div class="path-card path-card--selected" data-day-id="${t(m.id)}">
                    ${u(m,{isAnchor:!1,isSelected:!0},r)}
                </div>
                ${d(m,{isAnchor:!1},a,o)}
            </div>
        `)}let T=`path-cards-row${w.length===1?` path-cards-row--solo-anchor`:``}`;return`
        <div class="path-strip">
            <button type="button" class="path-nav-btn" id="pathPrevBtn" title="Previous day" aria-label="Previous day" ${S?`disabled`:``}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <div class="path-chips" role="group" aria-label="Trip days">
                ${v}
                ${b}
            </div>
            <button type="button" class="path-nav-btn" id="pathNextBtn" title="Next day" aria-label="Next day" ${C?`disabled`:``}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        </div>
        <div class="path-summary">${t(g)}</div>
        <div class="${T}">${w.join(``)}</div>
    `}var p={};try{let e=localStorage.getItem(`home_path_selected_day_by_trip`);e&&(p=JSON.parse(e)||{})}catch{p={}}var m={repaintPathTab:null,onSelectedDayChange:null};function h(e){`repaintPathTab`in e&&(m.repaintPathTab=e.repaintPathTab??null),`onSelectedDayChange`in e&&(m.onSelectedDayChange=e.onSelectedDayChange??null)}function g(e){return p[e]}function _(e){if(e in p){delete p[e];try{localStorage.setItem(`home_path_selected_day_by_trip`,JSON.stringify(p))}catch{}}}function v(e,t){if(!e||!t||p[e]===t)return;p[e]=t;try{localStorage.setItem(`home_path_selected_day_by_trip`,JSON.stringify(p))}catch{}if(typeof window<`u`&&typeof window.matchMedia==`function`&&window.matchMedia(`(max-width: 720px)`).matches){let n=(r.tripDays||[]).filter(t=>t.tripId===e),i=n.find(e=>e.id===t),a=n.find(e=>Number(e.dayNumber)===0);i&&Number(i.dayNumber)>0&&(a&&l(a.id,!0),l(i.id,!1))}if(typeof m.repaintPathTab==`function`&&m.repaintPathTab(),typeof m.onSelectedDayChange==`function`)try{m.onSelectedDayChange()}catch(e){console.warn(`[GG] onSelectedDayChange threw — likely stale home closure:`,e)}let n=window.activeMap;if(!n)return;let i=(r.tripDays||[]).find(e=>e.id===t);if(!i)return;let a=typeof i.lat==`number`?i.lat:null,o=typeof i.lng==`number`?i.lng:typeof i.lon==`number`?i.lon:null;try{if(a!=null&&o!=null)n.panTo({lat:a,lng:o}),typeof n.getZoom==`function`&&n.getZoom()<13&&n.setZoom(13);else if(i.dayNumber===0){let t=(r.trips||[]).find(t=>t.id===e);t&&typeof t.lat==`number`&&typeof t.lng==`number`&&n.panTo({lat:t.lat,lng:t.lng})}}catch{}}function y(e,t){if(!e||!t.length)return null;let n=p[e.id];if(n&&t.some(e=>e.id===n))return n;let r=new Date().toISOString().slice(0,10),i=t.find(e=>e.dayNumber>0&&e.date===r);if(i)return i.id;let a=t.find(e=>e.dayNumber>0);return a?a.id:t[0].id}export{v as a,y as i,g as n,f as o,h as r,s,_ as t};
//# sourceMappingURL=pathSelection-CEXpBSHC.js.map