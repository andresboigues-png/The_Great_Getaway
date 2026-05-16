import{r as e,t}from"./vendor-react-CAxw18f3.js";import{At as n,Bt as r,C as i,Dt as a,Et as o,Kt as s,Mt as c,Nt as l,Ot as u,St as d,Vt as f,Wt as p,Zt as m,f as h,nt as g,v as _,wt as v,xt as y,y as b}from"../app.bundle.js";import{t as x}from"./store-BBCF6MhB.js";var S=e();function C(e){if(!e)return{balances:{},roster:[],expenses:[]};let t=(r.expenses||[]).filter(t=>t.tripId===e.id),n=s(e),i=n.length>0?n:Array.from(new Set(t.flatMap(e=>[e.who,...Object.keys(e.splits||{})]).filter(Boolean))),a={};i.forEach(e=>a[e]=0);for(let e of t){let t=e.euroValue||e.value||0;if(a[e.who]!==void 0&&(a[e.who]+=t),e.splits&&Object.keys(e.splits).length>0)for(let[n,r]of Object.entries(e.splits))a[n]!==void 0&&(a[n]-=t*(Number(r)/100));else{let e=t/Math.max(i.length,1);i.forEach(t=>{a[t]!==void 0&&(a[t]-=e)})}}return{balances:a,roster:i,expenses:t}}function w(e){let t=[],n=[];for(let[r,i]of Object.entries(e))i>.01?t.push({person:r,amount:i}):i<-.01&&n.push({person:r,amount:Math.abs(i)});t.sort((e,t)=>t.amount-e.amount),n.sort((e,t)=>t.amount-e.amount);let r=[],i=0,a=0;for(;i<n.length&&a<t.length;){let e=n[i],o=t[a],s=Math.min(e.amount,o.amount);r.push({from:e.person,to:o.person,amount:s}),e.amount-=s,o.amount-=s,e.amount<.01&&i++,o.amount<.01&&a++}return r}function T(){let e={};for(let t of[...r.trips,...r.archivedTrips||[]])for(let n of s(t))n in e||(e[n]=0);let t=(r.archivedTrips||[]).flatMap(e=>e.expenses||[]),n=[...r.expenses,...t],i={};for(let e of[...r.trips,...r.archivedTrips||[]])i[e.id]=s(e);for(let t of n){let n=t.euroValue||t.value||0;if(e[t.who]!==void 0&&(e[t.who]+=n),t.splits&&Object.keys(t.splits).length>0)for(let[r,i]of Object.entries(t.splits))e[r]!==void 0&&(e[r]-=n*(Number(i)/100));else{let r=i[t.tripId]||[],a=r.length>0?r:Array.from(new Set([t.who,...Object.keys(t.splits||{})].filter(Boolean))),o=n/Math.max(a.length,1);a.forEach(t=>{e[t]!==void 0&&(e[t]-=o)})}}return e}function E(e){if(!e)return[];let t=(r.expenses||[]).filter(t=>t.tripId===e.id),n=s(e),i={};n.forEach(e=>i[e]={paid:0,share:0});for(let e of t){let t=e.euroValue||e.value||0;if(i[e.who]&&(i[e.who].paid+=t),e.splits&&Object.keys(e.splits).length>0)for(let[n,r]of Object.entries(e.splits))i[n]&&(i[n].share+=t*(Number(r)/100));else{let e=t/Math.max(n.length,1);n.forEach(t=>{i[t]&&(i[t].share+=e)})}}return Object.entries(i).map(([e,t])=>({name:e,paid:t.paid,share:t.share,net:t.paid-t.share}))}function D(e,t,n,r){let i=n===`global`?``:O(r),a=`
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #ffd60a; --g-to: #ff9f0a;">${_(`settlement.title`)}</h1>
            <p>${_(`settlement.subtitle`)}</p>
        </div>
        ${i}
    `;return e?`
        ${a}
        ${k(e,n)}
        ${n===`trip`?A(e,t):``}
        ${n===`history`?j(e,t):``}
        ${n===`global`?M():``}
    `:`
            ${a}
            <div class="card glass" style="text-align: center; padding: 60px 32px; margin-top: 24px; border-radius: 28px;">
                <div style="font-size: 4rem; margin-bottom: 12px;">⚖️</div>
                <h2 style="margin:0 0 6px;">${_(`settlement.noTripsTitle`)}</h2>
                <p class="text-muted">${_(`settlement.noTripsBody`)}</p>
            </div>
        `}function O(e){if(r.trips.length===0)return``;let t=r.trips.find(t=>t.id===e),n=t?(r.expenses||[]).filter(e=>e.tripId===t.id&&e.isSettlement).reduce((e,t)=>e+(t.euroValue||0),0):0,i=r.trips.map(t=>{let n=(r.expenses||[]).filter(e=>e.tripId===t.id&&e.isSettlement).reduce((e,t)=>e+(t.euroValue||0),0),i=n>0?` — ${c(n,`EUR`)} ${_(`settlement.settledSuffix`)}`:``;return`<option value="${v(t.id)}"${t.id===e?` selected`:``}>${v(t.name)}${i}</option>`}).join(``);return`
        <div class="settlement-trip-picker" style="margin-top: 18px; margin-bottom: 16px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <label for="settlementTripSelect" style="display:inline-flex; align-items:center; gap:8px; font-size:0.74rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-secondary); flex-shrink:0;">
                <span style="font-size:0.95rem;">⚖️</span>
                ${_(`settlement.tripPickerLabel`)}
            </label>
            <select id="settlementTripSelect" class="settlement-trip-select"
                aria-label="${_(`settlement.tripPickerAriaLabel`)}"
                style="flex:1; min-width:200px; max-width:380px; padding:10px 14px; border-radius:12px; border:1.5px solid rgba(255,159,10,0.4); background:linear-gradient(135deg, rgba(255,214,10,0.08), rgba(255,159,10,0.04)); font-size:0.92rem; font-weight:700; color: var(--text-brand-navy); cursor:pointer; outline:none; font-family:inherit; transition: border-color 0.18s ease, box-shadow 0.18s ease;">
                ${i}
            </select>
            ${t&&n>0?`
                <span style="display:inline-flex; align-items:center; padding:6px 12px; border-radius:999px; background:rgba(0,113,227,0.08); color: var(--accent-blue-deep); font-size:0.78rem; font-weight:800; flex-shrink:0;">
                    ${c(n,`EUR`)} ${_(`settlement.settledSuffix`)}
                </span>
            `:``}
        </div>
    `}function k(e,t){let n=(r.expenses||[]).filter(t=>t.tripId===e.id&&t.isSettlement).length,i=(e,n,r)=>`
        <button class="settle-tab${t===e?` is-active`:``}" data-tab="${e}" type="button"
            style="background:none; border:0; padding:12px 4px; font-size:0.95rem; font-weight:${t===e?`800`:`600`}; color:${t===e?`var(--accent-blue-deep)`:`var(--text-secondary)`}; cursor:pointer; border-bottom:2px solid ${t===e?`var(--accent-blue)`:`transparent`}; margin-bottom:-1px; letter-spacing:-0.01em; transition: color 0.2s, border-color 0.2s;">
            ${n}${r!==void 0&&r>0?` <span style="background:rgba(0,113,227,0.12); color: var(--accent-blue-deep); padding:1px 6px; border-radius:999px; font-size:0.7rem; font-weight:800; margin-left:2px;">${r}</span>`:``}
        </button>
    `;return`
        <nav style="display:flex; gap:36px; border-bottom: 1px solid rgba(0,113,227,0.25); margin: 22px 0 22px; padding: 0 4px;">
            ${i(`trip`,_(`settlement.tabThisTrip`))}
            ${i(`history`,_(`settlement.tabHistory`),n)}
            ${i(`global`,_(`settlement.tabCrossTrip`))}
        </nav>
    `}function A(e,t){let{balances:n}=C(e),r=w(n),i=E(e),a=i.reduce((e,t)=>e+t.paid,0),o=[...i].sort((e,t)=>t.paid-e.paid)[0],s=[...i].sort((e,t)=>e.net-t.net)[0],l=[...i].sort((e,t)=>t.net-e.net)[0],u=v(e?.name||`Trip`),d=a>0?`
        <div class="card glass" style="margin-bottom: 18px; padding: 22px 26px; border-radius: 28px; background: linear-gradient(135deg, rgba(255,214,10,0.05), rgba(255,159,10,0.03)); border:1px solid rgba(255,159,10,0.18);">
            <div style="display:flex; flex-wrap:wrap; gap:24px; align-items:center; justify-content:space-between;">
                <div style="min-width:0;">
                    <div style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary); margin-bottom:6px;">${_(`settlement.tripTotal`)} · ${u}</div>
                    <div style="font-size:2rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.02em;">${c(a,`EUR`)}</div>
                </div>
                ${o?`
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${_(`settlement.topPayer`)}</div>
                        <div style="font-size:1.1rem; font-weight:800; color: var(--text-brand-navy); margin-top:4px;">${v(o.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:var(--text-secondary);">${c(o.paid,`EUR`)}</div>
                    </div>
                `:``}
                ${l&&l.net>.01?`
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${_(`settlement.topOwed`)}</div>
                        <div style="font-size:1.1rem; font-weight:800; color: var(--text-brand-navy); margin-top:4px;">${v(l.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#1a6b3c;">+${c(l.net,`EUR`)}</div>
                    </div>
                `:``}
                ${s&&s.net<-.01?`
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#ff3b30;">${_(`settlement.topOwes`)}</div>
                        <div style="font-size:1.1rem; font-weight:800; color: var(--text-brand-navy); margin-top:4px;">${v(s.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#a30000;">${c(s.net,`EUR`)}</div>
                    </div>
                `:``}
            </div>
        </div>
    `:``,f=Object.entries(n).map(([e,t])=>{let n=t>.01,r=t<-.01;return`
            <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                <div style="width:34px; height:34px; border-radius:50%; background: ${n?`rgba(52,199,89,0.18)`:r?`rgba(255,59,48,0.18)`:`var(--surface-subtle)`}; color: ${n?`#1a6b3c`:r?`#a30000`:`var(--text-secondary)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                    ${v(e.charAt(0).toUpperCase())}
                </div>
                <div style="flex:1; min-width:0; font-weight:800; color: var(--text-brand-navy); font-size:0.95rem; overflow:hidden; text-overflow:ellipsis;">${v(e)}</div>
                <div style="font-weight:800; color: ${n?`#1a6b3c`:r?`#a30000`:`var(--text-secondary)`}; font-size:1rem;">
                    ${n?`+`:``}${c(t,`EUR`)}
                </div>
            </div>
        `}).join(``)||`<p class="text-muted" style="padding: 20px; text-align:center;">${_(`settlement.emptyNoCompanions`)}</p>`,p=r.length===0?`<div style="text-align:center; padding: 40px 20px;"><div style="font-size:2.2rem; margin-bottom:8px;">🥂</div><p style="margin:0; font-weight:800; color:#1a6b3c;">${_(`settlement.allSettledTitle`)}</p><p style="margin:6px 0 0; color:var(--text-secondary); font-size:0.85rem;">${_(`settlement.allSettledBody`)}</p></div>`:r.map(n=>`
            <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:16px;">
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${v(n.from)}</span>
                        <span style="color:rgba(0,0,0,0.3);">→</span>
                        <span style="font-weight:800; color: var(--text-brand-navy); font-size:0.95rem;">${v(n.to)}</span>
                    </div>
                    <div style="font-size:1.3rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.01em; margin-top:2px;">${c(n.amount,`EUR`)}</div>
                </div>
                ${t?`
                    <button class="btn-primary settle-debt-btn" data-trip-id="${v(e.id)}" data-from="${v(n.from)}" data-to="${v(n.to)}" data-amount="${n.amount}"
                        style="padding: 8px 18px; font-size:0.85rem; border-radius: 999px; flex-shrink:0;">${_(`settlement.settleBtn`)}</button>
                `:``}
            </div>
        `).join(``);return`
        ${d}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:18px; margin-bottom:24px;">
            <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                    <h3 style="margin:0; font-size:1.05rem; color: var(--text-brand-navy); font-weight:800; letter-spacing:-0.02em;">${_(`settlement.tripBalancesTitle`)} · ${u}</h3>
                    <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${b(`settlement.peopleCount`,Object.keys(n).length)}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    ${f}
                </div>
            </div>
            <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
                    <div style="min-width:0;">
                        <h3 style="margin:0; font-size:1.05rem; color: var(--text-brand-navy); font-weight:800; letter-spacing:-0.02em;">${_(`settlement.suggestedPaymentsTitle`)} · ${u}</h3>
                        <div style="font-size:0.7rem; font-weight:700; color:var(--text-secondary); margin-top:3px;">${_(`settlement.suggestedPaymentsSubtitle`)}</div>
                    </div>
                    <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em; flex-shrink:0;">${b(`settlement.paymentsCount`,r.length)}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${p}
                </div>
            </div>
        </div>
        ${t?`
            <div style="text-align:center; margin-bottom: 24px;">
                <button class="btn-ghost open-manual-settle-btn" data-trip-id="${v(e.id)}" type="button"
                    style="background: var(--card-bg); border:1px solid var(--border-subtle); color: var(--text-brand-navy); padding: 10px 24px; border-radius: 999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow: 0 4px 12px rgba(0,45,91,0.05);">
                    ${_(`settlement.manualSettleOpenBtn`)}
                </button>
            </div>
        `:``}
    `}function j(e,t){let n=(r.expenses||[]).filter(t=>t.tripId===e.id&&t.isSettlement).sort((e,t)=>new Date(t.date).getTime()-new Date(e.date).getTime());if(n.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">📜</div>
                <h2 style="margin:0 0 6px; color: var(--text-brand-navy);">${_(`settlement.historyEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${_(`settlement.historyEmptyBody`)}</p>
            </div>
        `;let i={};for(let e of n){let t=e.date||`undated`;i[t]||(i[t]=[]),i[t].push(e)}let a=new Date().toISOString().slice(0,10),o=new Date;o.setDate(o.getDate()-1);let s=o.toISOString().slice(0,10),l=e=>{if(e===`undated`)return _(`settlement.historyDateNoDate`);if(e===a)return _(`settlement.historyDateToday`);if(e===s)return _(`settlement.historyDateYesterday`);let t=new Date(e);return isNaN(t.getTime())?e:t.toLocaleDateString(void 0,{weekday:`short`,month:`short`,day:`numeric`,year:`numeric`})},u=Object.keys(i).sort((e,t)=>e===`undated`?1:t===`undated`?-1:t.localeCompare(e));return`
        <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <h3 style="margin:0; font-size:1.05rem; color: var(--text-brand-navy); font-weight:800; letter-spacing:-0.02em;">${_(`settlement.historyTitle`)}</h3>
                <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${_(`settlement.historyRecorded`,{count:n.length})}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:18px;">
                ${u.map(n=>{let r=i[n],a=r.reduce((e,t)=>e+(t.euroValue||0),0);return`
                        <div>
                            <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:8px; padding: 0 4px;">
                                <h4 style="margin:0; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary);">${v(l(n))}</h4>
                                <span style="font-size:0.72rem; font-weight:700; color:var(--text-secondary);">${b(`settlement.historyDayTotalPlural`,r.length,{amount:c(a,`EUR`)})}</span>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                ${r.map(n=>{let r=Object.keys(n.splits||{})[0]||`?`;return`
                                        <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                                            <div style="width:34px; height:34px; border-radius:50%; background:rgba(52,199,89,0.12); color:#1a6b3c; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">${v((n.who||`?`).charAt(0).toUpperCase())}</div>
                                            <div style="flex:1; min-width:0;">
                                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                                    <span style="font-weight:800; color: var(--text-brand-navy); font-size:0.95rem;">${v(n.who)}</span>
                                                    <span style="color:rgba(0,0,0,0.3); font-weight:600;">→</span>
                                                    <span style="font-weight:800; color: var(--text-brand-navy); font-size:0.95rem;">${v(r)}</span>
                                                    <span style="display:inline-flex; align-items:center; gap:3px; background:rgba(52,199,89,0.12); color:#1a6b3c; padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${_(`settlement.historyChipSettled`)}</span>
                                                </div>
                                            </div>
                                            <div style="font-size:1rem; font-weight:800; color:#1a6b3c; flex-shrink:0;">${c(n.euroValue||0,`EUR`)}</div>
                                            ${t?`
                                                <div style="display:flex; gap:6px; flex-shrink:0;">
                                                    <button class="edit-settlement-btn" data-settlement-id="${v(n.id)}" type="button"
                                                        style="background:rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.22); color: var(--accent-blue-deep); padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${_(`settlement.historyEditBtn`)}</button>
                                                    <button class="unsettle-settlement-btn" data-settlement-id="${v(n.id)}" data-trip-id="${v(e.id)}" type="button"
                                                        style="background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.22); color:#ff3b30; padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${_(`settlement.historyUnsettleBtn`)}</button>
                                                </div>
                                            `:``}
                                        </div>
                                    `}).join(``)}
                            </div>
                        </div>
                    `}).join(``)}
            </div>
        </div>
    `}function M(){let e=T(),t=Object.entries(e).sort((e,t)=>t[1]-e[1]),n=Math.max(...Object.values(e).map(Math.abs),1),r=t.some(([,e])=>Math.abs(e)>.01);if(t.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">🌍</div>
                <h2 style="margin:0 0 6px; color: var(--text-brand-navy);">${_(`settlement.crossTripEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${_(`settlement.crossTripEmptyBody`)}</p>
            </div>
        `;let i=w(e);return`
        <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                <h3 style="margin:0; font-size:1.05rem; color: var(--text-brand-navy); font-weight:800; letter-spacing:-0.02em;">${_(`settlement.crossTripTitle`)}</h3>
                <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${_(`settlement.crossTripSubtitle`)}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
                ${t.map(([e,t])=>{let i=r?Math.min(Math.abs(t)/n*100,100):0,a=t>.01,o=t<-.01,s=a?`#1a6b3c`:o?`#a30000`:`var(--text-secondary)`;return`
                        <div style="display:flex; flex-direction:column; gap:10px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                            <div style="display:flex; align-items:center; gap:14px;">
                                <div style="width:34px; height:34px; border-radius:50%; background: ${a?`rgba(52,199,89,0.12)`:o?`rgba(255,59,48,0.1)`:`var(--surface-subtle)`}; color: ${a?`#1a6b3c`:o?`#a30000`:`var(--text-secondary)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                                    ${v(e.charAt(0).toUpperCase())}
                                </div>
                                <div style="flex:1; min-width:0; font-weight:800; color: var(--text-brand-navy); font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${v(e)}</div>
                                <div style="font-weight:800; color: ${s}; font-size:1rem;">
                                    ${a?`+`:``}${c(t,`EUR`)}
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
                        <h3 style="margin:0; font-size:1.05rem; color: var(--text-brand-navy); font-weight:800; letter-spacing:-0.02em;">Suggested cross-trip payments</h3>
                        <div style="font-size:0.7rem; font-weight:700; color:var(--text-secondary); margin-top:3px;">Fewest payments to clear everyone across every trip you share. Record the actual settlement on whichever trip's tab fits.</div>
                    </div>
                    <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em; flex-shrink:0;">${i.length} ${i.length===1?`payment`:`payments`}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${i.map(e=>`
                        <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:16px;">
                            <div style="flex:1; min-width:0;">
                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                    <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${v(e.from)}</span>
                                    <span style="color:rgba(0,0,0,0.3);">→</span>
                                    <span style="font-weight:800; color: var(--text-brand-navy); font-size:0.95rem;">${v(e.to)}</span>
                                </div>
                                <div style="font-size:1.3rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.01em; margin-top:2px;">${c(e.amount,`EUR`)}</div>
                            </div>
                        </div>
                    `).join(``)}
                </div>
            </div>
        `:``}
    `}function N(e,t,a,s,l,d){if(t===a){u(_(`settlement.toastSenderEqualsReceiver`));return}if(!Number.isFinite(s)||s<=0){u(_(`settlement.toastAmountInvalid`));return}let h=n(s,l,`EUR`),g={id:o(),tripId:e,label:`Settlement: ${t} → ${a}`,value:s,euroValue:h,currency:l,who:t,categoryId:r.categories[0]?.id??``,country:_(`settlement.expenseCountry`),date:new Date().toISOString().split(`T`)[0]??``,splits:{[a]:100},isSettlement:!0};r.expenses.push(g),f(m.STATE_CHANGED);let v=r.trips.find(t=>t.id===e),y=p(v,t)?.linkedUserId,b=p(v,a)?.linkedUserId;y&&b?(i({tripId:e,fromUserId:y,toUserId:b,amount:s,currency:l,euroValue:h,...d?.method?{method:d.method}:{},...d?.note?{note:d.note}:{}}).then(e=>{e.error&&console.warn(`[settlement] /api/settlements failed:`,e.error)}),u(`Recorded ${c(h,`EUR`)} ${t} → ${a} · notified ${a}`)):u(`Recorded ${c(h,`EUR`)} ${t} → ${a}`)}function P(e){y({title:_(`settlement.toastUnsettleConfirmTitle`),message:_(`settlement.toastUnsettleConfirmMessage`),confirmText:_(`settlement.toastUnsettleConfirmBtn`),onConfirm:()=>{r.expenses=r.expenses.filter(t=>t.id!==e),f(m.STATE_CHANGED)}})}var F=[{value:`cash`,label:`Cash`},{value:`revolut`,label:`Revolut`},{value:`bank_transfer`,label:`Bank transfer`},{value:`wise`,label:`Wise`},{value:`paypal`,label:`PayPal`},{value:`custom`,label:`Custom`}];function I(e){let t=s(r.trips.find(t=>t.id===e)).map(e=>`<option value="${v(e)}">${v(e)}</option>`).join(``),n=F.map(e=>`<option value="${v(e.value)}">${v(e.label)}</option>`).join(``),i=l(),{root:o,close:c}=d({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${_(`settlement.manualTitle`)}</h2>
            <p class="text-subtitle">${_(`settlement.manualSubtitle`)}</p>
            <form id="manualSettleForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">From</label>
                <select id="manualSettleFrom" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background: var(--card-bg);">${t}</select>
                <label class="form-label" style="margin-top:6px;">To</label>
                <select id="manualSettleTo" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background: var(--card-bg);">${t}</select>
                <label class="form-label" style="margin-top:6px;">Amount (${v(i)})</label>
                <input type="number" step="0.01" min="0.01" id="manualSettleAmount" class="glass-input" placeholder="0.00" required style="padding: var(--space-3); border-radius: 12px;">
                <label class="form-label" style="margin-top:6px;">Method</label>
                <select id="manualSettleMethod" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background: var(--card-bg);">${n}</select>
                <label class="form-label" style="margin-top:6px;">Note <span class="text-subtitle" style="font-weight:500;">(optional)</span></label>
                <input type="text" id="manualSettleNote" class="glass-input" maxlength="240" placeholder="e.g. Cash at the airport" style="padding: var(--space-3); border-radius: 12px;">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelManualSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">Cancel</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">Record payment</button>
                </div>
            </form>
        `});a(o,`#cancelManualSettleBtn`).onclick=()=>c(),a(o,`#manualSettleForm`).onsubmit=t=>{t.preventDefault();let n=a(o,`#manualSettleFrom`).value,r=a(o,`#manualSettleTo`).value,s=parseFloat(a(o,`#manualSettleAmount`).value),l=a(o,`#manualSettleMethod`).value,d=a(o,`#manualSettleNote`).value.trim();if(n===r){u(_(`settlement.toastSenderEqualsReceiver`));return}N(e,n,r,s,i,{method:l,note:d}),c()}}function L(e){let t=r.expenses.find(t=>t.id===e);if(!t)return;let i=s(r.trips.find(e=>e.id===t.tripId)),o=i.map(e=>`<option value="${v(e)}" ${t.who===e?`selected`:``}>${v(e)}</option>`).join(``),c=Object.keys(t.splits||{})[0],p=i.map(e=>`<option value="${v(e)}" ${c===e?`selected`:``}>${v(e)}</option>`).join(``),h=l(),{root:g,close:y}=d({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${_(`settlement.editTitle`)}</h2>
            <form id="editSettlementForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">From</label>
                <select id="editSettleFrom" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background: var(--card-bg);">${o}</select>
                <label class="form-label" style="margin-top:6px;">To</label>
                <select id="editSettleTo" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background: var(--card-bg);">${p}</select>
                <label class="form-label" style="margin-top:6px;">Amount (${v(h)})</label>
                <input type="number" step="0.01" min="0.01" id="editSettleAmount" value="${n(t.euroValue||0,`EUR`,h).toFixed(2)}" class="glass-input" required style="padding: var(--space-3); border-radius: 12px;">
                <label class="form-label" style="margin-top:6px;">Date</label>
                <input type="date" id="editSettleDate" value="${v(t.date||``)}" class="glass-input" required style="padding: var(--space-3); border-radius: 12px;">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelEditSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">Cancel</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">Update</button>
                </div>
            </form>
        `});a(g,`#cancelEditSettleBtn`).onclick=()=>y(),a(g,`#editSettlementForm`).onsubmit=e=>{e.preventDefault();let r=a(g,`#editSettleFrom`).value,i=a(g,`#editSettleTo`).value,o=parseFloat(a(g,`#editSettleAmount`).value),s=a(g,`#editSettleDate`).value;if(r===i){u(_(`settlement.toastSenderEqualsReceiver`));return}t.who=r,t.splits={[i]:100},t.value=o,t.currency=h,t.euroValue=n(o,h,`EUR`),t.date=s,t.label=`Settlement: ${r} → ${i}`,f(m.STATE_CHANGED),y()}}var R=t();function z(){let e=x(e=>e.trips),t=x(e=>e.activeTripId),n=x(e=>e.expenses),[i,a]=(0,S.useState)(`trip`),[o,s]=(0,S.useState)(()=>t||(e.length>0?e[0].id:null));(0,S.useEffect)(()=>{t&&t!==o&&s(t)},[t,o]),(0,S.useEffect)(()=>{if(o&&!e.find(e=>e.id===o)){let t=e.length>0?e[0].id:null;s(t),t&&(r.activeTripId=t,f(m.STATE_CHANGED))}},[e,o]);let c=e=>{s(e),r.activeTripId=e,f(m.STATE_CHANGED),i===`global`&&a(`trip`)},l=e.find(e=>e.id===o)||null,u=h(l),d=(0,S.useMemo)(()=>D(l,u,i,o),[l,u,i,o,n]),p=(0,S.useRef)(null),g=e=>{let t=e.target;if(!t)return;let n=t.closest(`.settlement-trip-pill`);if(n?.dataset.tripId){c(n.dataset.tripId);return}let r=t.closest(`.settle-tab`);if(r?.dataset.tab){a(r.dataset.tab);return}let i=t.closest(`.settle-debt-btn`);if(i?.dataset.tripId&&i.dataset.from&&i.dataset.to&&i.dataset.amount&&!i.disabled){i.disabled=!0,i.textContent=_(`settlement.recordingBtn`),N(i.dataset.tripId,i.dataset.from,i.dataset.to,parseFloat(i.dataset.amount),`EUR`);return}let o=t.closest(`.open-manual-settle-btn`);if(o?.dataset.tripId){I(o.dataset.tripId);return}let s=t.closest(`.edit-settlement-btn`);if(s?.dataset.settlementId){L(s.dataset.settlementId);return}let l=t.closest(`.unsettle-settlement-btn`);if(l?.dataset.settlementId){P(l.dataset.settlementId);return}},v=(0,S.useRef)(c);return v.current=c,(0,S.useEffect)(()=>{let e=p.current;if(!e)return;let t=e=>{let t=e.target;if(t?.id===`settlementTripSelect`){let e=t;e.value&&v.current(e.value)}};return e.addEventListener(`change`,t),()=>e.removeEventListener(`change`,t)},[]),(0,R.jsx)(`div`,{ref:p,onClick:g,dangerouslySetInnerHTML:{__html:d}})}function B(e){g(e,(0,S.createElement)(z))}export{B as mountSettlement};
//# sourceMappingURL=mount-C-f6jRhw.js.map