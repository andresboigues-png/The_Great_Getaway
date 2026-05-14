import{r as e,t}from"./vendor-react-CAxw18f3.js";import{At as n,Dt as r,Ht as i,It as a,Kt as o,L as s,Mt as c,Nt as l,Ot as u,Pt as d,Rt as f,Ut as p,Zt as m,i as h,r as g,vt as _,zt as v}from"../app.bundle.js";import{t as y}from"./store-BLz-OpRy.js";var b=e();function x(e){if(!e)return{balances:{},roster:[],expenses:[]};let t=(i.expenses||[]).filter(t=>t.tripId===e.id),n=o(e),r=n.length>0?n:Array.from(new Set(t.flatMap(e=>[e.who,...Object.keys(e.splits||{})]).filter(Boolean))),a={};r.forEach(e=>a[e]=0);for(let e of t){let t=e.euroValue||e.value||0;if(a[e.who]!==void 0&&(a[e.who]+=t),e.splits&&Object.keys(e.splits).length>0)for(let[n,r]of Object.entries(e.splits))a[n]!==void 0&&(a[n]-=t*(Number(r)/100));else{let e=t/Math.max(r.length,1);r.forEach(t=>{a[t]!==void 0&&(a[t]-=e)})}}return{balances:a,roster:r,expenses:t}}function S(e){let t=[],n=[];for(let[r,i]of Object.entries(e))i>.01?t.push({person:r,amount:i}):i<-.01&&n.push({person:r,amount:Math.abs(i)});t.sort((e,t)=>t.amount-e.amount),n.sort((e,t)=>t.amount-e.amount);let r=[],i=0,a=0;for(;i<n.length&&a<t.length;){let e=n[i],o=t[a],s=Math.min(e.amount,o.amount);r.push({from:e.person,to:o.person,amount:s}),e.amount-=s,o.amount-=s,e.amount<.01&&i++,o.amount<.01&&a++}return r}function C(){let e={};for(let t of[...i.trips,...i.archivedTrips||[]])for(let n of o(t))n in e||(e[n]=0);let t=(i.archivedTrips||[]).flatMap(e=>e.expenses||[]),n=[...i.expenses,...t],r={};for(let e of[...i.trips,...i.archivedTrips||[]])r[e.id]=o(e);for(let t of n){let n=t.euroValue||t.value||0;if(e[t.who]!==void 0&&(e[t.who]+=n),t.splits&&Object.keys(t.splits).length>0)for(let[r,i]of Object.entries(t.splits))e[r]!==void 0&&(e[r]-=n*(Number(i)/100));else{let i=r[t.tripId]||[],a=i.length>0?i:Array.from(new Set([t.who,...Object.keys(t.splits||{})].filter(Boolean))),o=n/Math.max(a.length,1);a.forEach(t=>{e[t]!==void 0&&(e[t]-=o)})}}return e}function w(e){if(!e)return[];let t=(i.expenses||[]).filter(t=>t.tripId===e.id),n=o(e),r={};n.forEach(e=>r[e]={paid:0,share:0});for(let e of t){let t=e.euroValue||e.value||0;if(r[e.who]&&(r[e.who].paid+=t),e.splits&&Object.keys(e.splits).length>0)for(let[n,i]of Object.entries(e.splits))r[n]&&(r[n].share+=t*(Number(i)/100));else{let e=t/Math.max(n.length,1);n.forEach(t=>{r[t]&&(r[t].share+=e)})}}return Object.entries(r).map(([e,t])=>({name:e,paid:t.paid,share:t.share,net:t.paid-t.share}))}function T(e,t,n,r){let i=E(r),a=`
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #ffd60a; --g-to: #ff9f0a;">${g(`settlement.title`)}</h1>
            <p>${g(`settlement.subtitle`)}</p>
        </div>
        ${i}
    `;return e?`
        ${a}
        ${D(e,n)}
        ${n===`trip`?O(e,t):``}
        ${n===`history`?k(e,t):``}
        ${n===`global`?A():``}
    `:`
            ${a}
            <div class="card glass" style="text-align: center; padding: 60px 32px; margin-top: 24px; border-radius: 28px;">
                <div style="font-size: 4rem; margin-bottom: 12px;">⚖️</div>
                <h2 style="margin:0 0 6px;">${g(`settlement.noTripsTitle`)}</h2>
                <p class="text-muted">${g(`settlement.noTripsBody`)}</p>
            </div>
        `}function E(e){if(i.trips.length===0)return``;let t=i.trips.find(t=>t.id===e),r=t?(i.expenses||[]).filter(e=>e.tripId===t.id&&e.isSettlement).reduce((e,t)=>e+(t.euroValue||0),0):0,a=i.trips.map(t=>{let r=(i.expenses||[]).filter(e=>e.tripId===t.id&&e.isSettlement).reduce((e,t)=>e+(t.euroValue||0),0),a=r>0?` — ${f(r,`EUR`)} ${g(`settlement.settledSuffix`)}`:``;return`<option value="${n(t.id)}"${t.id===e?` selected`:``}>${n(t.name)}${a}</option>`}).join(``);return`
        <div class="settlement-trip-picker" style="margin-top: 18px; margin-bottom: 16px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <label for="settlementTripSelect" style="display:inline-flex; align-items:center; gap:8px; font-size:0.74rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-secondary); flex-shrink:0;">
                <span style="font-size:0.95rem;">⚖️</span>
                ${g(`settlement.tripPickerLabel`)}
            </label>
            <select id="settlementTripSelect" class="settlement-trip-select"
                aria-label="${g(`settlement.tripPickerAriaLabel`)}"
                style="flex:1; min-width:200px; max-width:380px; padding:10px 14px; border-radius:12px; border:1.5px solid rgba(255,159,10,0.4); background:linear-gradient(135deg, rgba(255,214,10,0.08), rgba(255,159,10,0.04)); font-size:0.92rem; font-weight:700; color:#002d5b; cursor:pointer; outline:none; font-family:inherit; transition: border-color 0.18s ease, box-shadow 0.18s ease;">
                ${a}
            </select>
            ${t&&r>0?`
                <span style="display:inline-flex; align-items:center; padding:6px 12px; border-radius:999px; background:rgba(0,113,227,0.08); color:#005bb8; font-size:0.78rem; font-weight:800; flex-shrink:0;">
                    ${f(r,`EUR`)} ${g(`settlement.settledSuffix`)}
                </span>
            `:``}
        </div>
    `}function D(e,t){let n=(i.expenses||[]).filter(t=>t.tripId===e.id&&t.isSettlement).length,r=(e,n,r)=>`
        <button class="settle-tab${t===e?` is-active`:``}" data-tab="${e}" type="button"
            style="background:none; border:0; padding:12px 4px; font-size:0.95rem; font-weight:${t===e?`800`:`600`}; color:${t===e?`#005bb8`:`var(--text-secondary)`}; cursor:pointer; border-bottom:2px solid ${t===e?`var(--accent-blue)`:`transparent`}; margin-bottom:-1px; letter-spacing:-0.01em; transition: color 0.2s, border-color 0.2s;">
            ${n}${r!==void 0&&r>0?` <span style="background:rgba(0,113,227,0.12); color:#005bb8; padding:1px 6px; border-radius:999px; font-size:0.7rem; font-weight:800; margin-left:2px;">${r}</span>`:``}
        </button>
    `;return`
        <nav style="display:flex; gap:36px; border-bottom: 1px solid rgba(0,113,227,0.25); margin: 22px 0 22px; padding: 0 4px;">
            ${r(`trip`,g(`settlement.tabThisTrip`))}
            ${r(`history`,g(`settlement.tabHistory`),n)}
            ${r(`global`,g(`settlement.tabCrossTrip`))}
        </nav>
    `}function O(e,t){let{balances:r}=x(e),i=S(r),a=w(e),o=a.reduce((e,t)=>e+t.paid,0),s=[...a].sort((e,t)=>t.paid-e.paid)[0],c=[...a].sort((e,t)=>e.net-t.net)[0],l=[...a].sort((e,t)=>t.net-e.net)[0],u=o>0?`
        <div class="card glass" style="margin-bottom: 18px; padding: 22px 26px; border-radius: 28px; background: linear-gradient(135deg, rgba(255,214,10,0.05), rgba(255,159,10,0.03)); border:1px solid rgba(255,159,10,0.18);">
            <div style="display:flex; flex-wrap:wrap; gap:24px; align-items:center; justify-content:space-between;">
                <div style="min-width:0;">
                    <div style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary); margin-bottom:6px;">${g(`settlement.tripTotal`)}</div>
                    <div style="font-size:2rem; font-weight:800; color:#002d5b; letter-spacing:-0.02em;">${f(o,`EUR`)}</div>
                </div>
                ${s?`
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${g(`settlement.topPayer`)}</div>
                        <div style="font-size:1.1rem; font-weight:800; color:#002d5b; margin-top:4px;">${n(s.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:var(--text-secondary);">${f(s.paid,`EUR`)}</div>
                    </div>
                `:``}
                ${l&&l.net>.01?`
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${g(`settlement.topOwed`)}</div>
                        <div style="font-size:1.1rem; font-weight:800; color:#002d5b; margin-top:4px;">${n(l.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#1a6b3c;">+${f(l.net,`EUR`)}</div>
                    </div>
                `:``}
                ${c&&c.net<-.01?`
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#ff3b30;">${g(`settlement.topOwes`)}</div>
                        <div style="font-size:1.1rem; font-weight:800; color:#002d5b; margin-top:4px;">${n(c.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#a30000;">${f(c.net,`EUR`)}</div>
                    </div>
                `:``}
            </div>
        </div>
    `:``,d=Object.entries(r).map(([e,t])=>{let r=t>.01,i=t<-.01;return`
            <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:14px;">
                <div style="width:34px; height:34px; border-radius:50%; background: ${r?`rgba(52,199,89,0.12)`:i?`rgba(255,59,48,0.1)`:`rgba(0,0,0,0.04)`}; color: ${r?`#1a6b3c`:i?`#a30000`:`rgba(0,0,0,0.5)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                    ${n(e.charAt(0).toUpperCase())}
                </div>
                <div style="flex:1; min-width:0; font-weight:800; color:#002d5b; font-size:0.95rem; overflow:hidden; text-overflow:ellipsis;">${n(e)}</div>
                <div style="font-weight:800; color: ${r?`#1a6b3c`:i?`#a30000`:`var(--text-secondary)`}; font-size:1rem;">
                    ${r?`+`:``}${f(t,`EUR`)}
                </div>
            </div>
        `}).join(``)||`<p class="text-muted" style="padding: 20px; text-align:center;">${g(`settlement.emptyNoCompanions`)}</p>`,p=i.length===0?`<div style="text-align:center; padding: 40px 20px;"><div style="font-size:2.2rem; margin-bottom:8px;">🥂</div><p style="margin:0; font-weight:800; color:#1a6b3c;">${g(`settlement.allSettledTitle`)}</p><p style="margin:6px 0 0; color:var(--text-secondary); font-size:0.85rem;">${g(`settlement.allSettledBody`)}</p></div>`:i.map(r=>`
            <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:16px;">
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${n(r.from)}</span>
                        <span style="color:rgba(0,0,0,0.3);">→</span>
                        <span style="font-weight:800; color:#002d5b; font-size:0.95rem;">${n(r.to)}</span>
                    </div>
                    <div style="font-size:1.3rem; font-weight:800; color:#002d5b; letter-spacing:-0.01em; margin-top:2px;">${f(r.amount,`EUR`)}</div>
                </div>
                ${t?`
                    <button class="btn-primary settle-debt-btn" data-trip-id="${n(e.id)}" data-from="${n(r.from)}" data-to="${n(r.to)}" data-amount="${r.amount}"
                        style="padding: 8px 18px; font-size:0.85rem; border-radius: 999px; flex-shrink:0;">${g(`settlement.settleBtn`)}</button>
                `:``}
            </div>
        `).join(``);return`
        ${u}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:18px; margin-bottom:24px;">
            <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                    <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">${g(`settlement.tripBalancesTitle`)}</h3>
                    <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${h(`settlement.peopleCount`,Object.keys(r).length)}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    ${d}
                </div>
            </div>
            <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
                    <div style="min-width:0;">
                        <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">${g(`settlement.suggestedPaymentsTitle`)}</h3>
                        <div style="font-size:0.7rem; font-weight:700; color:var(--text-secondary); margin-top:3px;">${g(`settlement.suggestedPaymentsSubtitle`)}</div>
                    </div>
                    <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em; flex-shrink:0;">${h(`settlement.paymentsCount`,i.length)}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${p}
                </div>
            </div>
        </div>
        ${t?`
            <div style="text-align:center; margin-bottom: 24px;">
                <button class="btn-ghost open-manual-settle-btn" data-trip-id="${n(e.id)}" type="button"
                    style="background: white; border:1px solid rgba(0,0,0,0.08); color:#002d5b; padding: 10px 24px; border-radius: 999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow: 0 4px 12px rgba(0,45,91,0.05);">
                    ${g(`settlement.manualSettleOpenBtn`)}
                </button>
            </div>
        `:``}
    `}function k(e,t){let r=(i.expenses||[]).filter(t=>t.tripId===e.id&&t.isSettlement).sort((e,t)=>new Date(t.date).getTime()-new Date(e.date).getTime());if(r.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">📜</div>
                <h2 style="margin:0 0 6px; color:#002d5b;">${g(`settlement.historyEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${g(`settlement.historyEmptyBody`)}</p>
            </div>
        `;let a={};for(let e of r){let t=e.date||`undated`;a[t]||(a[t]=[]),a[t].push(e)}let o=new Date().toISOString().slice(0,10),s=new Date;s.setDate(s.getDate()-1);let c=s.toISOString().slice(0,10),l=e=>{if(e===`undated`)return g(`settlement.historyDateNoDate`);if(e===o)return g(`settlement.historyDateToday`);if(e===c)return g(`settlement.historyDateYesterday`);let t=new Date(e);return isNaN(t.getTime())?e:t.toLocaleDateString(void 0,{weekday:`short`,month:`short`,day:`numeric`,year:`numeric`})},u=Object.keys(a).sort((e,t)=>e===`undated`?1:t===`undated`?-1:t.localeCompare(e));return`
        <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">${g(`settlement.historyTitle`)}</h3>
                <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${g(`settlement.historyRecorded`,{count:r.length})}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:18px;">
                ${u.map(r=>{let i=a[r],o=i.reduce((e,t)=>e+(t.euroValue||0),0);return`
                        <div>
                            <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:8px; padding: 0 4px;">
                                <h4 style="margin:0; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary);">${n(l(r))}</h4>
                                <span style="font-size:0.72rem; font-weight:700; color:var(--text-secondary);">${h(`settlement.historyDayTotalPlural`,i.length,{amount:f(o,`EUR`)})}</span>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                ${i.map(r=>{let i=Object.keys(r.splits||{})[0]||`?`;return`
                                        <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:14px;">
                                            <div style="width:34px; height:34px; border-radius:50%; background:rgba(52,199,89,0.12); color:#1a6b3c; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">${n((r.who||`?`).charAt(0).toUpperCase())}</div>
                                            <div style="flex:1; min-width:0;">
                                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                                    <span style="font-weight:800; color:#002d5b; font-size:0.95rem;">${n(r.who)}</span>
                                                    <span style="color:rgba(0,0,0,0.3); font-weight:600;">→</span>
                                                    <span style="font-weight:800; color:#002d5b; font-size:0.95rem;">${n(i)}</span>
                                                    <span style="display:inline-flex; align-items:center; gap:3px; background:rgba(52,199,89,0.12); color:#1a6b3c; padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${g(`settlement.historyChipSettled`)}</span>
                                                </div>
                                            </div>
                                            <div style="font-size:1rem; font-weight:800; color:#1a6b3c; flex-shrink:0;">${f(r.euroValue||0,`EUR`)}</div>
                                            ${t?`
                                                <div style="display:flex; gap:6px; flex-shrink:0;">
                                                    <button class="edit-settlement-btn" data-settlement-id="${n(r.id)}" type="button"
                                                        style="background:rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.22); color:#005bb8; padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${g(`settlement.historyEditBtn`)}</button>
                                                    <button class="unsettle-settlement-btn" data-settlement-id="${n(r.id)}" data-trip-id="${n(e.id)}" type="button"
                                                        style="background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.22); color:#ff3b30; padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${g(`settlement.historyUnsettleBtn`)}</button>
                                                </div>
                                            `:``}
                                        </div>
                                    `}).join(``)}
                            </div>
                        </div>
                    `}).join(``)}
            </div>
        </div>
    `}function A(){let e=C(),t=Object.entries(e).sort((e,t)=>t[1]-e[1]),r=Math.max(...Object.values(e).map(Math.abs),1),i=t.some(([,e])=>Math.abs(e)>.01);if(t.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">🌍</div>
                <h2 style="margin:0 0 6px; color:#002d5b;">${g(`settlement.crossTripEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${g(`settlement.crossTripEmptyBody`)}</p>
            </div>
        `;let a=S(e);return`
        <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">${g(`settlement.crossTripTitle`)}</h3>
                <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${g(`settlement.crossTripSubtitle`)}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
                ${t.map(([e,t])=>{let a=i?Math.min(Math.abs(t)/r*100,100):0,o=t>.01,s=t<-.01,c=o?`#1a6b3c`:s?`#a30000`:`var(--text-secondary)`;return`
                        <div style="display:flex; flex-direction:column; gap:10px; padding:12px 14px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:14px;">
                            <div style="display:flex; align-items:center; gap:14px;">
                                <div style="width:34px; height:34px; border-radius:50%; background: ${o?`rgba(52,199,89,0.12)`:s?`rgba(255,59,48,0.1)`:`rgba(0,0,0,0.04)`}; color: ${o?`#1a6b3c`:s?`#a30000`:`rgba(0,0,0,0.5)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                                    ${n(e.charAt(0).toUpperCase())}
                                </div>
                                <div style="flex:1; min-width:0; font-weight:800; color:#002d5b; font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${n(e)}</div>
                                <div style="font-weight:800; color: ${c}; font-size:1rem;">
                                    ${o?`+`:``}${f(t,`EUR`)}
                                </div>
                            </div>
                            ${i?`
                                <div style="height:6px; background: rgba(0,0,0,0.05); border-radius:999px; overflow:hidden; position:relative;">
                                    ${o?`<div style="position:absolute; left:50%; top:0; bottom:0; width:${a/2}%; background:#34c759; border-radius:999px;"></div>`:``}
                                    ${s?`<div style="position:absolute; right:50%; top:0; bottom:0; width:${a/2}%; background:#ff3b30; border-radius:999px;"></div>`:``}
                                    <div style="position:absolute; left:50%; top:-2px; bottom:-2px; width:1px; background: rgba(0,0,0,0.12);"></div>
                                </div>
                            `:``}
                        </div>
                    `}).join(``)}
            </div>
        </div>
        ${a.length>0?`
            <div class="card glass" style="margin-top:18px; padding: 22px 24px; border-radius: 28px;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
                    <div style="min-width:0;">
                        <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">Suggested cross-trip payments</h3>
                        <div style="font-size:0.7rem; font-weight:700; color:var(--text-secondary); margin-top:3px;">Fewest payments to clear everyone across every trip you share. Record the actual settlement on whichever trip's tab fits.</div>
                    </div>
                    <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em; flex-shrink:0;">${a.length} ${a.length===1?`payment`:`payments`}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${a.map(e=>`
                        <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:16px;">
                            <div style="flex:1; min-width:0;">
                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                    <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${n(e.from)}</span>
                                    <span style="color:rgba(0,0,0,0.3);">→</span>
                                    <span style="font-weight:800; color:#002d5b; font-size:0.95rem;">${n(e.to)}</span>
                                </div>
                                <div style="font-size:1.3rem; font-weight:800; color:#002d5b; letter-spacing:-0.01em; margin-top:2px;">${f(e.amount,`EUR`)}</div>
                            </div>
                        </div>
                    `).join(``)}
                </div>
            </div>
        `:``}
    `}function j(e,t,n,r,o){if(t===n){d(g(`settlement.toastSenderEqualsReceiver`));return}if(!Number.isFinite(r)||r<=0){d(g(`settlement.toastAmountInvalid`));return}let s=a(r,o,`EUR`),l={id:c(),tripId:e,label:`Settlement: ${t} → ${n}`,value:r,euroValue:s,currency:o,who:t,categoryId:i.categories[0]?.id??``,country:g(`settlement.expenseCountry`),date:new Date().toISOString().split(`T`)[0]??``,splits:{[n]:100},isSettlement:!0};i.expenses.push(l),p(m.STATE_CHANGED),d(`Recorded ${f(s,`EUR`)} ${t} → ${n}`)}function M(e){r({title:g(`settlement.toastUnsettleConfirmTitle`),message:g(`settlement.toastUnsettleConfirmMessage`),confirmText:g(`settlement.toastUnsettleConfirmBtn`),onConfirm:()=>{i.expenses=i.expenses.filter(t=>t.id!==e),p(m.STATE_CHANGED)}})}function N(e){let t=o(i.trips.find(t=>t.id===e)).map(e=>`<option value="${n(e)}">${n(e)}</option>`).join(``),r=v(),{root:a,close:s}=u({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${g(`settlement.manualTitle`)}</h2>
            <p class="text-subtitle">${g(`settlement.manualSubtitle`)}</p>
            <form id="manualSettleForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">From</label>
                <select id="manualSettleFrom" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">${t}</select>
                <label class="form-label" style="margin-top:6px;">To</label>
                <select id="manualSettleTo" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">${t}</select>
                <label class="form-label" style="margin-top:6px;">Amount (${n(r)})</label>
                <input type="number" step="0.01" min="0.01" id="manualSettleAmount" class="glass-input" placeholder="0.00" required style="padding: var(--space-3); border-radius: 12px;">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelManualSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">Cancel</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">Record payment</button>
                </div>
            </form>
        `});l(a,`#cancelManualSettleBtn`).onclick=()=>s(),l(a,`#manualSettleForm`).onsubmit=t=>{t.preventDefault();let n=l(a,`#manualSettleFrom`).value,i=l(a,`#manualSettleTo`).value,o=parseFloat(l(a,`#manualSettleAmount`).value);if(n===i){d(g(`settlement.toastSenderEqualsReceiver`));return}j(e,n,i,o,r),s()}}function P(e){let t=i.expenses.find(t=>t.id===e);if(!t)return;let r=o(i.trips.find(e=>e.id===t.tripId)),s=r.map(e=>`<option value="${n(e)}" ${t.who===e?`selected`:``}>${n(e)}</option>`).join(``),c=Object.keys(t.splits||{})[0],f=r.map(e=>`<option value="${n(e)}" ${c===e?`selected`:``}>${n(e)}</option>`).join(``),h=v(),{root:_,close:y}=u({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${g(`settlement.editTitle`)}</h2>
            <form id="editSettlementForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">From</label>
                <select id="editSettleFrom" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">${s}</select>
                <label class="form-label" style="margin-top:6px;">To</label>
                <select id="editSettleTo" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">${f}</select>
                <label class="form-label" style="margin-top:6px;">Amount (${n(h)})</label>
                <input type="number" step="0.01" min="0.01" id="editSettleAmount" value="${a(t.euroValue||0,`EUR`,h).toFixed(2)}" class="glass-input" required style="padding: var(--space-3); border-radius: 12px;">
                <label class="form-label" style="margin-top:6px;">Date</label>
                <input type="date" id="editSettleDate" value="${n(t.date||``)}" class="glass-input" required style="padding: var(--space-3); border-radius: 12px;">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelEditSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">Cancel</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">Update</button>
                </div>
            </form>
        `});l(_,`#cancelEditSettleBtn`).onclick=()=>y(),l(_,`#editSettlementForm`).onsubmit=e=>{e.preventDefault();let n=l(_,`#editSettleFrom`).value,r=l(_,`#editSettleTo`).value,i=parseFloat(l(_,`#editSettleAmount`).value),o=l(_,`#editSettleDate`).value;if(n===r){d(g(`settlement.toastSenderEqualsReceiver`));return}t.who=n,t.splits={[r]:100},t.value=i,t.currency=h,t.euroValue=a(i,h,`EUR`),t.date=o,t.label=`Settlement: ${n} → ${r}`,p(m.STATE_CHANGED),y()}}var F=t();function I(){let e=y(e=>e.trips),t=y(e=>e.activeTripId);y(e=>e.expenses);let[n,r]=(0,b.useState)(`trip`),[i,a]=(0,b.useState)(()=>t||(e.length>0?e[0].id:null));(0,b.useEffect)(()=>{i&&!e.find(e=>e.id===i)&&a(t||(e.length>0?e[0].id:null))},[e,i,t]);let o=e.find(e=>e.id===i)||null,s=_(o),c=(0,b.useMemo)(()=>T(o,s,n,i),[o,s,n,i,y.length]),l=(0,b.useRef)(null);return(0,F.jsx)(`div`,{ref:l,onClick:e=>{let t=e.target;if(!t)return;let n=t.closest(`.settlement-trip-pill`);if(n?.dataset.tripId){a(n.dataset.tripId);return}let i=t.closest(`.settle-tab`);if(i?.dataset.tab){r(i.dataset.tab);return}let o=t.closest(`.settle-debt-btn`);if(o?.dataset.tripId&&o.dataset.from&&o.dataset.to&&o.dataset.amount&&!o.disabled){o.disabled=!0,o.textContent=g(`settlement.recordingBtn`),j(o.dataset.tripId,o.dataset.from,o.dataset.to,parseFloat(o.dataset.amount),`EUR`);return}let s=t.closest(`.open-manual-settle-btn`);if(s?.dataset.tripId){N(s.dataset.tripId);return}let c=t.closest(`.edit-settlement-btn`);if(c?.dataset.settlementId){P(c.dataset.settlementId);return}let l=t.closest(`.unsettle-settlement-btn`);if(l?.dataset.settlementId){M(l.dataset.settlementId);return}},onChange:e=>{let t=e.target;if(t&&t.id===`settlementTripSelect`){let e=t;e.value&&a(e.value)}},dangerouslySetInnerHTML:{__html:c}})}function L(e){s(e,(0,b.createElement)(I))}export{L as mountSettlement};
//# sourceMappingURL=mount-DDwrm16V.js.map