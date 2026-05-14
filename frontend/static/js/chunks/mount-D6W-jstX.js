import{r as e,t}from"./vendor-react-CAxw18f3.js";import{Ct as n,Dt as r,Ft as i,Ot as a,Pt as o,St as s,Tt as c,Wt as l,_t as u,et as d,f,gt as p,v as m,xt as h,y as g,yt as _,zt as v}from"../app.bundle.js";import{t as y}from"./store-DhtbLKAM.js";var b=e();function x(e){if(!e)return{balances:{},roster:[],expenses:[]};let t=(o.expenses||[]).filter(t=>t.tripId===e.id),n=v(e),r=n.length>0?n:Array.from(new Set(t.flatMap(e=>[e.who,...Object.keys(e.splits||{})]).filter(Boolean))),i={};r.forEach(e=>i[e]=0);for(let e of t){let t=e.euroValue||e.value||0;if(i[e.who]!==void 0&&(i[e.who]+=t),e.splits&&Object.keys(e.splits).length>0)for(let[n,r]of Object.entries(e.splits))i[n]!==void 0&&(i[n]-=t*(Number(r)/100));else{let e=t/Math.max(r.length,1);r.forEach(t=>{i[t]!==void 0&&(i[t]-=e)})}}return{balances:i,roster:r,expenses:t}}function S(e){let t=[],n=[];for(let[r,i]of Object.entries(e))i>.01?t.push({person:r,amount:i}):i<-.01&&n.push({person:r,amount:Math.abs(i)});t.sort((e,t)=>t.amount-e.amount),n.sort((e,t)=>t.amount-e.amount);let r=[],i=0,a=0;for(;i<n.length&&a<t.length;){let e=n[i],o=t[a],s=Math.min(e.amount,o.amount);r.push({from:e.person,to:o.person,amount:s}),e.amount-=s,o.amount-=s,e.amount<.01&&i++,o.amount<.01&&a++}return r}function C(){let e={};for(let t of[...o.trips,...o.archivedTrips||[]])for(let n of v(t))n in e||(e[n]=0);let t=(o.archivedTrips||[]).flatMap(e=>e.expenses||[]),n=[...o.expenses,...t],r={};for(let e of[...o.trips,...o.archivedTrips||[]])r[e.id]=v(e);for(let t of n){let n=t.euroValue||t.value||0;if(e[t.who]!==void 0&&(e[t.who]+=n),t.splits&&Object.keys(t.splits).length>0)for(let[r,i]of Object.entries(t.splits))e[r]!==void 0&&(e[r]-=n*(Number(i)/100));else{let i=r[t.tripId]||[],a=i.length>0?i:Array.from(new Set([t.who,...Object.keys(t.splits||{})].filter(Boolean))),o=n/Math.max(a.length,1);a.forEach(t=>{e[t]!==void 0&&(e[t]-=o)})}}return e}function w(e){if(!e)return[];let t=(o.expenses||[]).filter(t=>t.tripId===e.id),n=v(e),r={};n.forEach(e=>r[e]={paid:0,share:0});for(let e of t){let t=e.euroValue||e.value||0;if(r[e.who]&&(r[e.who].paid+=t),e.splits&&Object.keys(e.splits).length>0)for(let[n,i]of Object.entries(e.splits))r[n]&&(r[n].share+=t*(Number(i)/100));else{let e=t/Math.max(n.length,1);n.forEach(t=>{r[t]&&(r[t].share+=e)})}}return Object.entries(r).map(([e,t])=>({name:e,paid:t.paid,share:t.share,net:t.paid-t.share}))}function T(e,t,n,r){let i=E(r),a=`
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #ffd60a; --g-to: #ff9f0a;">${m(`settlement.title`)}</h1>
            <p>${m(`settlement.subtitle`)}</p>
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
                <h2 style="margin:0 0 6px;">${m(`settlement.noTripsTitle`)}</h2>
                <p class="text-muted">${m(`settlement.noTripsBody`)}</p>
            </div>
        `}function E(e){if(o.trips.length===0)return``;let t=o.trips.find(t=>t.id===e),n=t?(o.expenses||[]).filter(e=>e.tripId===t.id&&e.isSettlement).reduce((e,t)=>e+(t.euroValue||0),0):0,i=o.trips.map(t=>{let n=(o.expenses||[]).filter(e=>e.tripId===t.id&&e.isSettlement).reduce((e,t)=>e+(t.euroValue||0),0),i=n>0?` — ${r(n,`EUR`)} ${m(`settlement.settledSuffix`)}`:``;return`<option value="${_(t.id)}"${t.id===e?` selected`:``}>${_(t.name)}${i}</option>`}).join(``);return`
        <div class="settlement-trip-picker" style="margin-top: 18px; margin-bottom: 16px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <label for="settlementTripSelect" style="display:inline-flex; align-items:center; gap:8px; font-size:0.74rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-secondary); flex-shrink:0;">
                <span style="font-size:0.95rem;">⚖️</span>
                ${m(`settlement.tripPickerLabel`)}
            </label>
            <select id="settlementTripSelect" class="settlement-trip-select"
                aria-label="${m(`settlement.tripPickerAriaLabel`)}"
                style="flex:1; min-width:200px; max-width:380px; padding:10px 14px; border-radius:12px; border:1.5px solid rgba(255,159,10,0.4); background:linear-gradient(135deg, rgba(255,214,10,0.08), rgba(255,159,10,0.04)); font-size:0.92rem; font-weight:700; color:#002d5b; cursor:pointer; outline:none; font-family:inherit; transition: border-color 0.18s ease, box-shadow 0.18s ease;">
                ${i}
            </select>
            ${t&&n>0?`
                <span style="display:inline-flex; align-items:center; padding:6px 12px; border-radius:999px; background:rgba(0,113,227,0.08); color:#005bb8; font-size:0.78rem; font-weight:800; flex-shrink:0;">
                    ${r(n,`EUR`)} ${m(`settlement.settledSuffix`)}
                </span>
            `:``}
        </div>
    `}function D(e,t){let n=(o.expenses||[]).filter(t=>t.tripId===e.id&&t.isSettlement).length,r=(e,n,r)=>`
        <button class="settle-tab${t===e?` is-active`:``}" data-tab="${e}" type="button"
            style="background:none; border:0; padding:12px 4px; font-size:0.95rem; font-weight:${t===e?`800`:`600`}; color:${t===e?`#005bb8`:`var(--text-secondary)`}; cursor:pointer; border-bottom:2px solid ${t===e?`var(--accent-blue)`:`transparent`}; margin-bottom:-1px; letter-spacing:-0.01em; transition: color 0.2s, border-color 0.2s;">
            ${n}${r!==void 0&&r>0?` <span style="background:rgba(0,113,227,0.12); color:#005bb8; padding:1px 6px; border-radius:999px; font-size:0.7rem; font-weight:800; margin-left:2px;">${r}</span>`:``}
        </button>
    `;return`
        <nav style="display:flex; gap:36px; border-bottom: 1px solid rgba(0,113,227,0.25); margin: 22px 0 22px; padding: 0 4px;">
            ${r(`trip`,m(`settlement.tabThisTrip`))}
            ${r(`history`,m(`settlement.tabHistory`),n)}
            ${r(`global`,m(`settlement.tabCrossTrip`))}
        </nav>
    `}function O(e,t){let{balances:n}=x(e),i=S(n),a=w(e),o=a.reduce((e,t)=>e+t.paid,0),s=[...a].sort((e,t)=>t.paid-e.paid)[0],c=[...a].sort((e,t)=>e.net-t.net)[0],l=[...a].sort((e,t)=>t.net-e.net)[0],u=o>0?`
        <div class="card glass" style="margin-bottom: 18px; padding: 22px 26px; border-radius: 28px; background: linear-gradient(135deg, rgba(255,214,10,0.05), rgba(255,159,10,0.03)); border:1px solid rgba(255,159,10,0.18);">
            <div style="display:flex; flex-wrap:wrap; gap:24px; align-items:center; justify-content:space-between;">
                <div style="min-width:0;">
                    <div style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary); margin-bottom:6px;">${m(`settlement.tripTotal`)}</div>
                    <div style="font-size:2rem; font-weight:800; color:#002d5b; letter-spacing:-0.02em;">${r(o,`EUR`)}</div>
                </div>
                ${s?`
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${m(`settlement.topPayer`)}</div>
                        <div style="font-size:1.1rem; font-weight:800; color:#002d5b; margin-top:4px;">${_(s.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:var(--text-secondary);">${r(s.paid,`EUR`)}</div>
                    </div>
                `:``}
                ${l&&l.net>.01?`
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${m(`settlement.topOwed`)}</div>
                        <div style="font-size:1.1rem; font-weight:800; color:#002d5b; margin-top:4px;">${_(l.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#1a6b3c;">+${r(l.net,`EUR`)}</div>
                    </div>
                `:``}
                ${c&&c.net<-.01?`
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#ff3b30;">${m(`settlement.topOwes`)}</div>
                        <div style="font-size:1.1rem; font-weight:800; color:#002d5b; margin-top:4px;">${_(c.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#a30000;">${r(c.net,`EUR`)}</div>
                    </div>
                `:``}
            </div>
        </div>
    `:``,d=Object.entries(n).map(([e,t])=>{let n=t>.01,i=t<-.01;return`
            <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:14px;">
                <div style="width:34px; height:34px; border-radius:50%; background: ${n?`rgba(52,199,89,0.12)`:i?`rgba(255,59,48,0.1)`:`rgba(0,0,0,0.04)`}; color: ${n?`#1a6b3c`:i?`#a30000`:`rgba(0,0,0,0.5)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                    ${_(e.charAt(0).toUpperCase())}
                </div>
                <div style="flex:1; min-width:0; font-weight:800; color:#002d5b; font-size:0.95rem; overflow:hidden; text-overflow:ellipsis;">${_(e)}</div>
                <div style="font-weight:800; color: ${n?`#1a6b3c`:i?`#a30000`:`var(--text-secondary)`}; font-size:1rem;">
                    ${n?`+`:``}${r(t,`EUR`)}
                </div>
            </div>
        `}).join(``)||`<p class="text-muted" style="padding: 20px; text-align:center;">${m(`settlement.emptyNoCompanions`)}</p>`,f=i.length===0?`<div style="text-align:center; padding: 40px 20px;"><div style="font-size:2.2rem; margin-bottom:8px;">🥂</div><p style="margin:0; font-weight:800; color:#1a6b3c;">${m(`settlement.allSettledTitle`)}</p><p style="margin:6px 0 0; color:var(--text-secondary); font-size:0.85rem;">${m(`settlement.allSettledBody`)}</p></div>`:i.map(n=>`
            <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:16px;">
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${_(n.from)}</span>
                        <span style="color:rgba(0,0,0,0.3);">→</span>
                        <span style="font-weight:800; color:#002d5b; font-size:0.95rem;">${_(n.to)}</span>
                    </div>
                    <div style="font-size:1.3rem; font-weight:800; color:#002d5b; letter-spacing:-0.01em; margin-top:2px;">${r(n.amount,`EUR`)}</div>
                </div>
                ${t?`
                    <button class="btn-primary settle-debt-btn" data-trip-id="${_(e.id)}" data-from="${_(n.from)}" data-to="${_(n.to)}" data-amount="${n.amount}"
                        style="padding: 8px 18px; font-size:0.85rem; border-radius: 999px; flex-shrink:0;">${m(`settlement.settleBtn`)}</button>
                `:``}
            </div>
        `).join(``);return`
        ${u}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:18px; margin-bottom:24px;">
            <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                    <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">${m(`settlement.tripBalancesTitle`)}</h3>
                    <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${g(`settlement.peopleCount`,Object.keys(n).length)}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    ${d}
                </div>
            </div>
            <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
                    <div style="min-width:0;">
                        <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">${m(`settlement.suggestedPaymentsTitle`)}</h3>
                        <div style="font-size:0.7rem; font-weight:700; color:var(--text-secondary); margin-top:3px;">${m(`settlement.suggestedPaymentsSubtitle`)}</div>
                    </div>
                    <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em; flex-shrink:0;">${g(`settlement.paymentsCount`,i.length)}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${f}
                </div>
            </div>
        </div>
        ${t?`
            <div style="text-align:center; margin-bottom: 24px;">
                <button class="btn-ghost open-manual-settle-btn" data-trip-id="${_(e.id)}" type="button"
                    style="background: white; border:1px solid rgba(0,0,0,0.08); color:#002d5b; padding: 10px 24px; border-radius: 999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow: 0 4px 12px rgba(0,45,91,0.05);">
                    ${m(`settlement.manualSettleOpenBtn`)}
                </button>
            </div>
        `:``}
    `}function k(e,t){let n=(o.expenses||[]).filter(t=>t.tripId===e.id&&t.isSettlement).sort((e,t)=>new Date(t.date).getTime()-new Date(e.date).getTime());if(n.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">📜</div>
                <h2 style="margin:0 0 6px; color:#002d5b;">${m(`settlement.historyEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${m(`settlement.historyEmptyBody`)}</p>
            </div>
        `;let i={};for(let e of n){let t=e.date||`undated`;i[t]||(i[t]=[]),i[t].push(e)}let a=new Date().toISOString().slice(0,10),s=new Date;s.setDate(s.getDate()-1);let c=s.toISOString().slice(0,10),l=e=>{if(e===`undated`)return m(`settlement.historyDateNoDate`);if(e===a)return m(`settlement.historyDateToday`);if(e===c)return m(`settlement.historyDateYesterday`);let t=new Date(e);return isNaN(t.getTime())?e:t.toLocaleDateString(void 0,{weekday:`short`,month:`short`,day:`numeric`,year:`numeric`})},u=Object.keys(i).sort((e,t)=>e===`undated`?1:t===`undated`?-1:t.localeCompare(e));return`
        <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">${m(`settlement.historyTitle`)}</h3>
                <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${m(`settlement.historyRecorded`,{count:n.length})}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:18px;">
                ${u.map(n=>{let a=i[n],o=a.reduce((e,t)=>e+(t.euroValue||0),0);return`
                        <div>
                            <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:8px; padding: 0 4px;">
                                <h4 style="margin:0; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary);">${_(l(n))}</h4>
                                <span style="font-size:0.72rem; font-weight:700; color:var(--text-secondary);">${g(`settlement.historyDayTotalPlural`,a.length,{amount:r(o,`EUR`)})}</span>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                ${a.map(n=>{let i=Object.keys(n.splits||{})[0]||`?`;return`
                                        <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:14px;">
                                            <div style="width:34px; height:34px; border-radius:50%; background:rgba(52,199,89,0.12); color:#1a6b3c; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">${_((n.who||`?`).charAt(0).toUpperCase())}</div>
                                            <div style="flex:1; min-width:0;">
                                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                                    <span style="font-weight:800; color:#002d5b; font-size:0.95rem;">${_(n.who)}</span>
                                                    <span style="color:rgba(0,0,0,0.3); font-weight:600;">→</span>
                                                    <span style="font-weight:800; color:#002d5b; font-size:0.95rem;">${_(i)}</span>
                                                    <span style="display:inline-flex; align-items:center; gap:3px; background:rgba(52,199,89,0.12); color:#1a6b3c; padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${m(`settlement.historyChipSettled`)}</span>
                                                </div>
                                            </div>
                                            <div style="font-size:1rem; font-weight:800; color:#1a6b3c; flex-shrink:0;">${r(n.euroValue||0,`EUR`)}</div>
                                            ${t?`
                                                <div style="display:flex; gap:6px; flex-shrink:0;">
                                                    <button class="edit-settlement-btn" data-settlement-id="${_(n.id)}" type="button"
                                                        style="background:rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.22); color:#005bb8; padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${m(`settlement.historyEditBtn`)}</button>
                                                    <button class="unsettle-settlement-btn" data-settlement-id="${_(n.id)}" data-trip-id="${_(e.id)}" type="button"
                                                        style="background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.22); color:#ff3b30; padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${m(`settlement.historyUnsettleBtn`)}</button>
                                                </div>
                                            `:``}
                                        </div>
                                    `}).join(``)}
                            </div>
                        </div>
                    `}).join(``)}
            </div>
        </div>
    `}function A(){let e=C(),t=Object.entries(e).sort((e,t)=>t[1]-e[1]),n=Math.max(...Object.values(e).map(Math.abs),1),i=t.some(([,e])=>Math.abs(e)>.01);if(t.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">🌍</div>
                <h2 style="margin:0 0 6px; color:#002d5b;">${m(`settlement.crossTripEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${m(`settlement.crossTripEmptyBody`)}</p>
            </div>
        `;let a=S(e);return`
        <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">${m(`settlement.crossTripTitle`)}</h3>
                <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${m(`settlement.crossTripSubtitle`)}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
                ${t.map(([e,t])=>{let a=i?Math.min(Math.abs(t)/n*100,100):0,o=t>.01,s=t<-.01,c=o?`#1a6b3c`:s?`#a30000`:`var(--text-secondary)`;return`
                        <div style="display:flex; flex-direction:column; gap:10px; padding:12px 14px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:14px;">
                            <div style="display:flex; align-items:center; gap:14px;">
                                <div style="width:34px; height:34px; border-radius:50%; background: ${o?`rgba(52,199,89,0.12)`:s?`rgba(255,59,48,0.1)`:`rgba(0,0,0,0.04)`}; color: ${o?`#1a6b3c`:s?`#a30000`:`rgba(0,0,0,0.5)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                                    ${_(e.charAt(0).toUpperCase())}
                                </div>
                                <div style="flex:1; min-width:0; font-weight:800; color:#002d5b; font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${_(e)}</div>
                                <div style="font-weight:800; color: ${c}; font-size:1rem;">
                                    ${o?`+`:``}${r(t,`EUR`)}
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
                                    <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${_(e.from)}</span>
                                    <span style="color:rgba(0,0,0,0.3);">→</span>
                                    <span style="font-weight:800; color:#002d5b; font-size:0.95rem;">${_(e.to)}</span>
                                </div>
                                <div style="font-size:1.3rem; font-weight:800; color:#002d5b; letter-spacing:-0.01em; margin-top:2px;">${r(e.amount,`EUR`)}</div>
                            </div>
                        </div>
                    `).join(``)}
                </div>
            </div>
        `:``}
    `}function j(e,t,a,s,u){if(t===a){n(m(`settlement.toastSenderEqualsReceiver`));return}if(!Number.isFinite(s)||s<=0){n(m(`settlement.toastAmountInvalid`));return}let d=c(s,u,`EUR`),f={id:h(),tripId:e,label:`Settlement: ${t} → ${a}`,value:s,euroValue:d,currency:u,who:t,categoryId:o.categories[0]?.id??``,country:m(`settlement.expenseCountry`),date:new Date().toISOString().split(`T`)[0]??``,splits:{[a]:100},isSettlement:!0};o.expenses.push(f),i(l.STATE_CHANGED),n(`Recorded ${r(d,`EUR`)} ${t} → ${a}`)}function M(e){p({title:m(`settlement.toastUnsettleConfirmTitle`),message:m(`settlement.toastUnsettleConfirmMessage`),confirmText:m(`settlement.toastUnsettleConfirmBtn`),onConfirm:()=>{o.expenses=o.expenses.filter(t=>t.id!==e),i(l.STATE_CHANGED)}})}function N(e){let t=v(o.trips.find(t=>t.id===e)).map(e=>`<option value="${_(e)}">${_(e)}</option>`).join(``),r=a(),{root:i,close:c}=u({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${m(`settlement.manualTitle`)}</h2>
            <p class="text-subtitle">${m(`settlement.manualSubtitle`)}</p>
            <form id="manualSettleForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">From</label>
                <select id="manualSettleFrom" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">${t}</select>
                <label class="form-label" style="margin-top:6px;">To</label>
                <select id="manualSettleTo" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">${t}</select>
                <label class="form-label" style="margin-top:6px;">Amount (${_(r)})</label>
                <input type="number" step="0.01" min="0.01" id="manualSettleAmount" class="glass-input" placeholder="0.00" required style="padding: var(--space-3); border-radius: 12px;">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelManualSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">Cancel</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">Record payment</button>
                </div>
            </form>
        `});s(i,`#cancelManualSettleBtn`).onclick=()=>c(),s(i,`#manualSettleForm`).onsubmit=t=>{t.preventDefault();let a=s(i,`#manualSettleFrom`).value,o=s(i,`#manualSettleTo`).value,l=parseFloat(s(i,`#manualSettleAmount`).value);if(a===o){n(m(`settlement.toastSenderEqualsReceiver`));return}j(e,a,o,l,r),c()}}function P(e){let t=o.expenses.find(t=>t.id===e);if(!t)return;let r=v(o.trips.find(e=>e.id===t.tripId)),d=r.map(e=>`<option value="${_(e)}" ${t.who===e?`selected`:``}>${_(e)}</option>`).join(``),f=Object.keys(t.splits||{})[0],p=r.map(e=>`<option value="${_(e)}" ${f===e?`selected`:``}>${_(e)}</option>`).join(``),h=a(),{root:g,close:y}=u({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${m(`settlement.editTitle`)}</h2>
            <form id="editSettlementForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">From</label>
                <select id="editSettleFrom" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">${d}</select>
                <label class="form-label" style="margin-top:6px;">To</label>
                <select id="editSettleTo" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">${p}</select>
                <label class="form-label" style="margin-top:6px;">Amount (${_(h)})</label>
                <input type="number" step="0.01" min="0.01" id="editSettleAmount" value="${c(t.euroValue||0,`EUR`,h).toFixed(2)}" class="glass-input" required style="padding: var(--space-3); border-radius: 12px;">
                <label class="form-label" style="margin-top:6px;">Date</label>
                <input type="date" id="editSettleDate" value="${_(t.date||``)}" class="glass-input" required style="padding: var(--space-3); border-radius: 12px;">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelEditSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">Cancel</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">Update</button>
                </div>
            </form>
        `});s(g,`#cancelEditSettleBtn`).onclick=()=>y(),s(g,`#editSettlementForm`).onsubmit=e=>{e.preventDefault();let r=s(g,`#editSettleFrom`).value,a=s(g,`#editSettleTo`).value,o=parseFloat(s(g,`#editSettleAmount`).value),u=s(g,`#editSettleDate`).value;if(r===a){n(m(`settlement.toastSenderEqualsReceiver`));return}t.who=r,t.splits={[a]:100},t.value=o,t.currency=h,t.euroValue=c(o,h,`EUR`),t.date=u,t.label=`Settlement: ${r} → ${a}`,i(l.STATE_CHANGED),y()}}var F=t();function I(){let e=y(e=>e.trips),t=y(e=>e.activeTripId);y(e=>e.expenses);let[n,r]=(0,b.useState)(`trip`),[i,a]=(0,b.useState)(()=>t||(e.length>0?e[0].id:null));(0,b.useEffect)(()=>{i&&!e.find(e=>e.id===i)&&a(t||(e.length>0?e[0].id:null))},[e,i,t]);let o=e.find(e=>e.id===i)||null,s=f(o),c=(0,b.useMemo)(()=>T(o,s,n,i),[o,s,n,i,y.length]),l=(0,b.useRef)(null);return(0,F.jsx)(`div`,{ref:l,onClick:e=>{let t=e.target;if(!t)return;let n=t.closest(`.settlement-trip-pill`);if(n?.dataset.tripId){a(n.dataset.tripId);return}let i=t.closest(`.settle-tab`);if(i?.dataset.tab){r(i.dataset.tab);return}let o=t.closest(`.settle-debt-btn`);if(o?.dataset.tripId&&o.dataset.from&&o.dataset.to&&o.dataset.amount&&!o.disabled){o.disabled=!0,o.textContent=m(`settlement.recordingBtn`),j(o.dataset.tripId,o.dataset.from,o.dataset.to,parseFloat(o.dataset.amount),`EUR`);return}let s=t.closest(`.open-manual-settle-btn`);if(s?.dataset.tripId){N(s.dataset.tripId);return}let c=t.closest(`.edit-settlement-btn`);if(c?.dataset.settlementId){P(c.dataset.settlementId);return}let l=t.closest(`.unsettle-settlement-btn`);if(l?.dataset.settlementId){M(l.dataset.settlementId);return}},onChange:e=>{let t=e.target;if(t&&t.id===`settlementTripSelect`){let e=t;e.value&&a(e.value)}},dangerouslySetInnerHTML:{__html:c}})}function L(e){d(e,(0,b.createElement)(I))}export{L as mountSettlement};
//# sourceMappingURL=mount-D6W-jstX.js.map