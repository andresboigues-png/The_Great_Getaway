import{r as e,t}from"./vendor-react-CAxw18f3.js";import{Ct as n,D as r,Tt as i,_t as a,at as o,bt as s,ct as c,dt as l,et as u,ft as d,gt as f,i as p,mt as m,ot as h,r as g,ut as _,xt as v}from"../app.bundle.js";import{t as y}from"./store-sh3fqxsJ.js";var b=e();function x(e){if(!e)return{balances:{},roster:[],expenses:[]};let t=(s.expenses||[]).filter(t=>t.tripId===e.id),r=n(e),i=r.length>0?r:Array.from(new Set(t.flatMap(e=>[e.who,...Object.keys(e.splits||{})]).filter(Boolean))),a={};i.forEach(e=>a[e]=0);for(let e of t){let t=e.euroValue||e.value||0;if(a[e.who]!==void 0&&(a[e.who]+=t),e.splits&&Object.keys(e.splits).length>0)for(let[n,r]of Object.entries(e.splits))a[n]!==void 0&&(a[n]-=t*(Number(r)/100));else{let e=t/Math.max(i.length,1);i.forEach(t=>{a[t]!==void 0&&(a[t]-=e)})}}return{balances:a,roster:i,expenses:t}}function S(e){let t=[],n=[];for(let[r,i]of Object.entries(e))i>.01?t.push({person:r,amount:i}):i<-.01&&n.push({person:r,amount:Math.abs(i)});t.sort((e,t)=>t.amount-e.amount),n.sort((e,t)=>t.amount-e.amount);let r=[],i=0,a=0;for(;i<n.length&&a<t.length;){let e=n[i],o=t[a],s=Math.min(e.amount,o.amount);r.push({from:e.person,to:o.person,amount:s}),e.amount-=s,o.amount-=s,e.amount<.01&&i++,o.amount<.01&&a++}return r}function C(){let e={};for(let t of[...s.trips,...s.archivedTrips||[]])for(let r of n(t))r in e||(e[r]=0);let t=(s.archivedTrips||[]).flatMap(e=>e.expenses||[]),r=[...s.expenses,...t],i={};for(let e of[...s.trips,...s.archivedTrips||[]])i[e.id]=n(e);for(let t of r){let n=t.euroValue||t.value||0;if(e[t.who]!==void 0&&(e[t.who]+=n),t.splits&&Object.keys(t.splits).length>0)for(let[r,i]of Object.entries(t.splits))e[r]!==void 0&&(e[r]-=n*(Number(i)/100));else{let r=i[t.tripId]||[],a=r.length>0?r:Array.from(new Set([t.who,...Object.keys(t.splits||{})].filter(Boolean))),o=n/Math.max(a.length,1);a.forEach(t=>{e[t]!==void 0&&(e[t]-=o)})}}return e}function w(e){if(!e)return[];let t=(s.expenses||[]).filter(t=>t.tripId===e.id),r=n(e),i={};r.forEach(e=>i[e]={paid:0,share:0});for(let e of t){let t=e.euroValue||e.value||0;if(i[e.who]&&(i[e.who].paid+=t),e.splits&&Object.keys(e.splits).length>0)for(let[n,r]of Object.entries(e.splits))i[n]&&(i[n].share+=t*(Number(r)/100));else{let e=t/Math.max(r.length,1);r.forEach(t=>{i[t]&&(i[t].share+=e)})}}return Object.entries(i).map(([e,t])=>({name:e,paid:t.paid,share:t.share,net:t.paid-t.share}))}function T(e,t,n,r){let i=E(r),a=`
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
        `}function E(e){if(s.trips.length===0)return``;let t=s.trips.find(t=>t.id===e),n=t?(s.expenses||[]).filter(e=>e.tripId===t.id&&e.isSettlement).reduce((e,t)=>e+(t.euroValue||0),0):0,r=s.trips.map(t=>{let n=(s.expenses||[]).filter(e=>e.tripId===t.id&&e.isSettlement).reduce((e,t)=>e+(t.euroValue||0),0),r=n>0?` — ${f(n,`EUR`)} ${g(`settlement.settledSuffix`)}`:``;return`<option value="${c(t.id)}"${t.id===e?` selected`:``}>${c(t.name)}${r}</option>`}).join(``);return`
        <div class="settlement-trip-picker" style="margin-top: 18px; margin-bottom: 16px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <label for="settlementTripSelect" style="display:inline-flex; align-items:center; gap:8px; font-size:0.74rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-secondary); flex-shrink:0;">
                <span style="font-size:0.95rem;">⚖️</span>
                ${g(`settlement.tripPickerLabel`)}
            </label>
            <select id="settlementTripSelect" class="settlement-trip-select"
                aria-label="${g(`settlement.tripPickerAriaLabel`)}"
                style="flex:1; min-width:200px; max-width:380px; padding:10px 14px; border-radius:12px; border:1.5px solid rgba(255,159,10,0.4); background:linear-gradient(135deg, rgba(255,214,10,0.08), rgba(255,159,10,0.04)); font-size:0.92rem; font-weight:700; color:#002d5b; cursor:pointer; outline:none; font-family:inherit; transition: border-color 0.18s ease, box-shadow 0.18s ease;">
                ${r}
            </select>
            ${t&&n>0?`
                <span style="display:inline-flex; align-items:center; padding:6px 12px; border-radius:999px; background:rgba(0,113,227,0.08); color:#005bb8; font-size:0.78rem; font-weight:800; flex-shrink:0;">
                    ${f(n,`EUR`)} ${g(`settlement.settledSuffix`)}
                </span>
            `:``}
        </div>
    `}function D(e,t){let n=(s.expenses||[]).filter(t=>t.tripId===e.id&&t.isSettlement).length,r=(e,n,r)=>`
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
    `}function O(e,t){let{balances:n}=x(e),r=S(n),i=w(e),a=i.reduce((e,t)=>e+t.paid,0),o=[...i].sort((e,t)=>t.paid-e.paid)[0],s=[...i].sort((e,t)=>e.net-t.net)[0],l=[...i].sort((e,t)=>t.net-e.net)[0],u=a>0?`
        <div class="card glass" style="margin-bottom: 18px; padding: 22px 26px; border-radius: 28px; background: linear-gradient(135deg, rgba(255,214,10,0.05), rgba(255,159,10,0.03)); border:1px solid rgba(255,159,10,0.18);">
            <div style="display:flex; flex-wrap:wrap; gap:24px; align-items:center; justify-content:space-between;">
                <div style="min-width:0;">
                    <div style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary); margin-bottom:6px;">${g(`settlement.tripTotal`)}</div>
                    <div style="font-size:2rem; font-weight:800; color:#002d5b; letter-spacing:-0.02em;">${f(a,`EUR`)}</div>
                </div>
                ${o?`
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${g(`settlement.topPayer`)}</div>
                        <div style="font-size:1.1rem; font-weight:800; color:#002d5b; margin-top:4px;">${c(o.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:var(--text-secondary);">${f(o.paid,`EUR`)}</div>
                    </div>
                `:``}
                ${l&&l.net>.01?`
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${g(`settlement.topOwed`)}</div>
                        <div style="font-size:1.1rem; font-weight:800; color:#002d5b; margin-top:4px;">${c(l.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#1a6b3c;">+${f(l.net,`EUR`)}</div>
                    </div>
                `:``}
                ${s&&s.net<-.01?`
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#ff3b30;">${g(`settlement.topOwes`)}</div>
                        <div style="font-size:1.1rem; font-weight:800; color:#002d5b; margin-top:4px;">${c(s.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#a30000;">${f(s.net,`EUR`)}</div>
                    </div>
                `:``}
            </div>
        </div>
    `:``,d=Object.entries(n).map(([e,t])=>{let n=t>.01,r=t<-.01;return`
            <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:14px;">
                <div style="width:34px; height:34px; border-radius:50%; background: ${n?`rgba(52,199,89,0.12)`:r?`rgba(255,59,48,0.1)`:`rgba(0,0,0,0.04)`}; color: ${n?`#1a6b3c`:r?`#a30000`:`rgba(0,0,0,0.5)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                    ${c(e.charAt(0).toUpperCase())}
                </div>
                <div style="flex:1; min-width:0; font-weight:800; color:#002d5b; font-size:0.95rem; overflow:hidden; text-overflow:ellipsis;">${c(e)}</div>
                <div style="font-weight:800; color: ${n?`#1a6b3c`:r?`#a30000`:`var(--text-secondary)`}; font-size:1rem;">
                    ${n?`+`:``}${f(t,`EUR`)}
                </div>
            </div>
        `}).join(``)||`<p class="text-muted" style="padding: 20px; text-align:center;">${g(`settlement.emptyNoCompanions`)}</p>`,m=r.length===0?`<div style="text-align:center; padding: 40px 20px;"><div style="font-size:2.2rem; margin-bottom:8px;">🥂</div><p style="margin:0; font-weight:800; color:#1a6b3c;">${g(`settlement.allSettledTitle`)}</p><p style="margin:6px 0 0; color:var(--text-secondary); font-size:0.85rem;">${g(`settlement.allSettledBody`)}</p></div>`:r.map(n=>`
            <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:16px;">
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${c(n.from)}</span>
                        <span style="color:rgba(0,0,0,0.3);">→</span>
                        <span style="font-weight:800; color:#002d5b; font-size:0.95rem;">${c(n.to)}</span>
                    </div>
                    <div style="font-size:1.3rem; font-weight:800; color:#002d5b; letter-spacing:-0.01em; margin-top:2px;">${f(n.amount,`EUR`)}</div>
                </div>
                ${t?`
                    <button class="btn-primary settle-debt-btn" data-trip-id="${c(e.id)}" data-from="${c(n.from)}" data-to="${c(n.to)}" data-amount="${n.amount}"
                        style="padding: 8px 18px; font-size:0.85rem; border-radius: 999px; flex-shrink:0;">${g(`settlement.settleBtn`)}</button>
                `:``}
            </div>
        `).join(``);return`
        ${u}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:18px; margin-bottom:24px;">
            <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                    <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">${g(`settlement.tripBalancesTitle`)}</h3>
                    <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${p(`settlement.peopleCount`,Object.keys(n).length)}</span>
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
                    <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em; flex-shrink:0;">${p(`settlement.paymentsCount`,r.length)}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${m}
                </div>
            </div>
        </div>
        ${t?`
            <div style="text-align:center; margin-bottom: 24px;">
                <button class="btn-ghost open-manual-settle-btn" data-trip-id="${c(e.id)}" type="button"
                    style="background: white; border:1px solid rgba(0,0,0,0.08); color:#002d5b; padding: 10px 24px; border-radius: 999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow: 0 4px 12px rgba(0,45,91,0.05);">
                    ${g(`settlement.manualSettleOpenBtn`)}
                </button>
            </div>
        `:``}
    `}function k(e,t){let n=(s.expenses||[]).filter(t=>t.tripId===e.id&&t.isSettlement).sort((e,t)=>new Date(t.date).getTime()-new Date(e.date).getTime());if(n.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">📜</div>
                <h2 style="margin:0 0 6px; color:#002d5b;">${g(`settlement.historyEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${g(`settlement.historyEmptyBody`)}</p>
            </div>
        `;let r={};for(let e of n){let t=e.date||`undated`;r[t]||(r[t]=[]),r[t].push(e)}let i=new Date().toISOString().slice(0,10),a=new Date;a.setDate(a.getDate()-1);let o=a.toISOString().slice(0,10),l=e=>{if(e===`undated`)return g(`settlement.historyDateNoDate`);if(e===i)return g(`settlement.historyDateToday`);if(e===o)return g(`settlement.historyDateYesterday`);let t=new Date(e);return isNaN(t.getTime())?e:t.toLocaleDateString(void 0,{weekday:`short`,month:`short`,day:`numeric`,year:`numeric`})},u=Object.keys(r).sort((e,t)=>e===`undated`?1:t===`undated`?-1:t.localeCompare(e));return`
        <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">${g(`settlement.historyTitle`)}</h3>
                <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${g(`settlement.historyRecorded`,{count:n.length})}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:18px;">
                ${u.map(n=>{let i=r[n],a=i.reduce((e,t)=>e+(t.euroValue||0),0);return`
                        <div>
                            <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:8px; padding: 0 4px;">
                                <h4 style="margin:0; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary);">${c(l(n))}</h4>
                                <span style="font-size:0.72rem; font-weight:700; color:var(--text-secondary);">${p(`settlement.historyDayTotalPlural`,i.length,{amount:f(a,`EUR`)})}</span>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                ${i.map(n=>{let r=Object.keys(n.splits||{})[0]||`?`;return`
                                        <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:14px;">
                                            <div style="width:34px; height:34px; border-radius:50%; background:rgba(52,199,89,0.12); color:#1a6b3c; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">${c((n.who||`?`).charAt(0).toUpperCase())}</div>
                                            <div style="flex:1; min-width:0;">
                                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                                    <span style="font-weight:800; color:#002d5b; font-size:0.95rem;">${c(n.who)}</span>
                                                    <span style="color:rgba(0,0,0,0.3); font-weight:600;">→</span>
                                                    <span style="font-weight:800; color:#002d5b; font-size:0.95rem;">${c(r)}</span>
                                                    <span style="display:inline-flex; align-items:center; gap:3px; background:rgba(52,199,89,0.12); color:#1a6b3c; padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${g(`settlement.historyChipSettled`)}</span>
                                                </div>
                                            </div>
                                            <div style="font-size:1rem; font-weight:800; color:#1a6b3c; flex-shrink:0;">${f(n.euroValue||0,`EUR`)}</div>
                                            ${t?`
                                                <div style="display:flex; gap:6px; flex-shrink:0;">
                                                    <button class="edit-settlement-btn" data-settlement-id="${c(n.id)}" type="button"
                                                        style="background:rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.22); color:#005bb8; padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${g(`settlement.historyEditBtn`)}</button>
                                                    <button class="unsettle-settlement-btn" data-settlement-id="${c(n.id)}" data-trip-id="${c(e.id)}" type="button"
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
    `}function A(){let e=C(),t=Object.entries(e).sort((e,t)=>t[1]-e[1]),n=Math.max(...Object.values(e).map(Math.abs),1),r=t.some(([,e])=>Math.abs(e)>.01);if(t.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">🌍</div>
                <h2 style="margin:0 0 6px; color:#002d5b;">${g(`settlement.crossTripEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${g(`settlement.crossTripEmptyBody`)}</p>
            </div>
        `;let i=S(e);return`
        <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">${g(`settlement.crossTripTitle`)}</h3>
                <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${g(`settlement.crossTripSubtitle`)}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
                ${t.map(([e,t])=>{let i=r?Math.min(Math.abs(t)/n*100,100):0,a=t>.01,o=t<-.01,s=a?`#1a6b3c`:o?`#a30000`:`var(--text-secondary)`;return`
                        <div style="display:flex; flex-direction:column; gap:10px; padding:12px 14px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:14px;">
                            <div style="display:flex; align-items:center; gap:14px;">
                                <div style="width:34px; height:34px; border-radius:50%; background: ${a?`rgba(52,199,89,0.12)`:o?`rgba(255,59,48,0.1)`:`rgba(0,0,0,0.04)`}; color: ${a?`#1a6b3c`:o?`#a30000`:`rgba(0,0,0,0.5)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                                    ${c(e.charAt(0).toUpperCase())}
                                </div>
                                <div style="flex:1; min-width:0; font-weight:800; color:#002d5b; font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${c(e)}</div>
                                <div style="font-weight:800; color: ${s}; font-size:1rem;">
                                    ${a?`+`:``}${f(t,`EUR`)}
                                </div>
                            </div>
                            ${r?`
                                <div style="height:6px; background: rgba(0,0,0,0.05); border-radius:999px; overflow:hidden; position:relative;">
                                    ${a?`<div style="position:absolute; left:50%; top:0; bottom:0; width:${i/2}%; background:#34c759; border-radius:999px;"></div>`:``}
                                    ${o?`<div style="position:absolute; right:50%; top:0; bottom:0; width:${i/2}%; background:#ff3b30; border-radius:999px;"></div>`:``}
                                    <div style="position:absolute; left:50%; top:-2px; bottom:-2px; width:1px; background: rgba(0,0,0,0.12);"></div>
                                </div>
                            `:``}
                        </div>
                    `}).join(``)}
            </div>
        </div>
        ${i.length>0?`
            <div class="card glass" style="margin-top:18px; padding: 22px 24px; border-radius: 28px;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
                    <div style="min-width:0;">
                        <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">Suggested cross-trip payments</h3>
                        <div style="font-size:0.7rem; font-weight:700; color:var(--text-secondary); margin-top:3px;">Fewest payments to clear everyone across every trip you share. Record the actual settlement on whichever trip's tab fits.</div>
                    </div>
                    <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em; flex-shrink:0;">${i.length} ${i.length===1?`payment`:`payments`}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${i.map(e=>`
                        <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:16px;">
                            <div style="flex:1; min-width:0;">
                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                    <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${c(e.from)}</span>
                                    <span style="color:rgba(0,0,0,0.3);">→</span>
                                    <span style="font-weight:800; color:#002d5b; font-size:0.95rem;">${c(e.to)}</span>
                                </div>
                                <div style="font-size:1.3rem; font-weight:800; color:#002d5b; letter-spacing:-0.01em; margin-top:2px;">${f(e.amount,`EUR`)}</div>
                            </div>
                        </div>
                    `).join(``)}
                </div>
            </div>
        `:``}
    `}function j(e,t,n,r,a){if(t===n){d(g(`settlement.toastSenderEqualsReceiver`));return}if(!Number.isFinite(r)||r<=0){d(g(`settlement.toastAmountInvalid`));return}let o=m(r,a,`EUR`),c={id:_(),tripId:e,label:`Settlement: ${t} → ${n}`,value:r,euroValue:o,currency:a,who:t,categoryId:s.categories[0]?.id??``,country:g(`settlement.expenseCountry`),date:new Date().toISOString().split(`T`)[0]??``,splits:{[n]:100},isSettlement:!0};s.expenses.push(c),v(i.STATE_CHANGED),d(`Recorded ${f(o,`EUR`)} ${t} → ${n}`)}function M(e){o({title:g(`settlement.toastUnsettleConfirmTitle`),message:g(`settlement.toastUnsettleConfirmMessage`),confirmText:g(`settlement.toastUnsettleConfirmBtn`),onConfirm:()=>{s.expenses=s.expenses.filter(t=>t.id!==e),v(i.STATE_CHANGED)}})}function N(e){let t=n(s.trips.find(t=>t.id===e)).map(e=>`<option value="${c(e)}">${c(e)}</option>`).join(``),r=a(),{root:i,close:o}=h({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${g(`settlement.manualTitle`)}</h2>
            <p class="text-subtitle">${g(`settlement.manualSubtitle`)}</p>
            <form id="manualSettleForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">From</label>
                <select id="manualSettleFrom" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">${t}</select>
                <label class="form-label" style="margin-top:6px;">To</label>
                <select id="manualSettleTo" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">${t}</select>
                <label class="form-label" style="margin-top:6px;">Amount (${c(r)})</label>
                <input type="number" step="0.01" min="0.01" id="manualSettleAmount" class="glass-input" placeholder="0.00" required style="padding: var(--space-3); border-radius: 12px;">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelManualSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">Cancel</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">Record payment</button>
                </div>
            </form>
        `});l(i,`#cancelManualSettleBtn`).onclick=()=>o(),l(i,`#manualSettleForm`).onsubmit=t=>{t.preventDefault();let n=l(i,`#manualSettleFrom`).value,a=l(i,`#manualSettleTo`).value,s=parseFloat(l(i,`#manualSettleAmount`).value);if(n===a){d(g(`settlement.toastSenderEqualsReceiver`));return}j(e,n,a,s,r),o()}}function P(e){let t=s.expenses.find(t=>t.id===e);if(!t)return;let r=n(s.trips.find(e=>e.id===t.tripId)),o=r.map(e=>`<option value="${c(e)}" ${t.who===e?`selected`:``}>${c(e)}</option>`).join(``),u=Object.keys(t.splits||{})[0],f=r.map(e=>`<option value="${c(e)}" ${u===e?`selected`:``}>${c(e)}</option>`).join(``),p=a(),{root:_,close:y}=h({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${g(`settlement.editTitle`)}</h2>
            <form id="editSettlementForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">From</label>
                <select id="editSettleFrom" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">${o}</select>
                <label class="form-label" style="margin-top:6px;">To</label>
                <select id="editSettleTo" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">${f}</select>
                <label class="form-label" style="margin-top:6px;">Amount (${c(p)})</label>
                <input type="number" step="0.01" min="0.01" id="editSettleAmount" value="${m(t.euroValue||0,`EUR`,p).toFixed(2)}" class="glass-input" required style="padding: var(--space-3); border-radius: 12px;">
                <label class="form-label" style="margin-top:6px;">Date</label>
                <input type="date" id="editSettleDate" value="${c(t.date||``)}" class="glass-input" required style="padding: var(--space-3); border-radius: 12px;">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelEditSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">Cancel</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">Update</button>
                </div>
            </form>
        `});l(_,`#cancelEditSettleBtn`).onclick=()=>y(),l(_,`#editSettlementForm`).onsubmit=e=>{e.preventDefault();let n=l(_,`#editSettleFrom`).value,r=l(_,`#editSettleTo`).value,a=parseFloat(l(_,`#editSettleAmount`).value),o=l(_,`#editSettleDate`).value;if(n===r){d(g(`settlement.toastSenderEqualsReceiver`));return}t.who=n,t.splits={[r]:100},t.value=a,t.currency=p,t.euroValue=m(a,p,`EUR`),t.date=o,t.label=`Settlement: ${n} → ${r}`,v(i.STATE_CHANGED),y()}}var F=t();function I(){let e=y(e=>e.trips),t=y(e=>e.activeTripId);y(e=>e.expenses);let[n,r]=(0,b.useState)(`trip`),[i,a]=(0,b.useState)(()=>t||(e.length>0?e[0].id:null));(0,b.useEffect)(()=>{i&&!e.find(e=>e.id===i)&&a(t||(e.length>0?e[0].id:null))},[e,i,t]);let o=e.find(e=>e.id===i)||null,s=u(o),c=(0,b.useMemo)(()=>T(o,s,n,i),[o,s,n,i,y.length]),l=(0,b.useRef)(null);return(0,F.jsx)(`div`,{ref:l,onClick:e=>{let t=e.target;if(!t)return;let n=t.closest(`.settlement-trip-pill`);if(n?.dataset.tripId){a(n.dataset.tripId);return}let i=t.closest(`.settle-tab`);if(i?.dataset.tab){r(i.dataset.tab);return}let o=t.closest(`.settle-debt-btn`);if(o?.dataset.tripId&&o.dataset.from&&o.dataset.to&&o.dataset.amount&&!o.disabled){o.disabled=!0,o.textContent=g(`settlement.recordingBtn`),j(o.dataset.tripId,o.dataset.from,o.dataset.to,parseFloat(o.dataset.amount),`EUR`);return}let s=t.closest(`.open-manual-settle-btn`);if(s?.dataset.tripId){N(s.dataset.tripId);return}let c=t.closest(`.edit-settlement-btn`);if(c?.dataset.settlementId){P(c.dataset.settlementId);return}let l=t.closest(`.unsettle-settlement-btn`);if(l?.dataset.settlementId){M(l.dataset.settlementId);return}},onChange:e=>{let t=e.target;if(t&&t.id===`settlementTripSelect`){let e=t;e.value&&a(e.value)}},dangerouslySetInnerHTML:{__html:c}})}function L(e){r(e,(0,b.createElement)(I))}export{L as mountSettlement};
//# sourceMappingURL=mount-CY6GGrt3.js.map