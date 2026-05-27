import{i as e}from"./rolldown-runtime-Kw0j5LDr.js";import{r as t,t as n}from"./vendor-react-mHyv4XDd.js";import{$t as r,A as i,Bt as a,Ft as o,Gt as s,Ht as c,It as l,Jt as u,Rt as d,S as f,T as p,Vt as m,an as h,dt as g,en as _,in as v,qt as y,rn as b,un as x,x as S}from"../app.bundle.js";import{t as C}from"./store-DfKQD6T6.js";import{n as w}from"./TripContext-DG2u6Ot3.js";var T=e(t(),1);function E(e,t,n){let r=t.fromName||void 0;if(!r||e[r]===void 0){let i=v(n,t.fromUserId)?.name;i&&e[i]!==void 0&&(r=i)}let i=t.toName||void 0;if(!i||e[i]===void 0){let r=v(n,t.toUserId)?.name;r&&e[r]!==void 0&&(i=r)}if(!r||!i)return;e[r]===void 0&&(e[r]=0),e[i]===void 0&&(e[i]=0);let a=t.euroValue||t.amount||0;e[r]+=a,e[i]-=a}function D(e){if(!e)return{balances:{},roster:[],expenses:[],removedFromRoster:[]};let t=(r.expenses||[]).filter(t=>t.tripId===e.id),n=h(e),i=Array.from(new Set(t.flatMap(e=>[e.who,...Object.keys(e.splits||{})]).filter(Boolean))),a=Array.from(new Set([...n,...i])),o=i.filter(e=>!n.includes(e)),s={};a.forEach(e=>s[e]=0);for(let e of t){let t=e.euroValue||e.value||0;if(s[e.who]!==void 0&&(s[e.who]+=t),e.splits&&Object.keys(e.splits).length>0){let n=Object.values(e.splits).reduce((e,t)=>e+Number(t||0),0),r=n>0?n:100;for(let[n,i]of Object.entries(e.splits))s[n]!==void 0&&(s[n]-=t*(Number(i)/r))}else{let e=t/Math.max(a.length,1);a.forEach(t=>{s[t]!==void 0&&(s[t]-=e)})}}let c=(r.settlements||[]).filter(t=>t.tripId===e.id);for(let t of c)E(s,t,e);return{balances:s,roster:a,expenses:t,removedFromRoster:o}}var O=.5;function k(e){let t=[],n=[];for(let[r,i]of Object.entries(e))i>O?t.push({person:r,amount:i}):i<-O&&n.push({person:r,amount:Math.abs(i)});t.sort((e,t)=>t.amount-e.amount),n.sort((e,t)=>t.amount-e.amount);let r=[],i=0,a=0;for(;i<n.length&&a<t.length;){let e=n[i],o=t[a],s=Math.min(e.amount,o.amount);r.push({from:e.person,to:o.person,amount:s}),e.amount-=s,o.amount-=s,e.amount<O&&i++,o.amount<O&&a++}return r}function A(){let e={};for(let t of[...r.trips,...r.archivedTrips||[]])for(let n of h(t))n in e||(e[n]=0);let t=new Set,n=[];for(let e of r.expenses)t.has(e.id)||(t.add(e.id),n.push(e));for(let e of r.archivedTrips||[])for(let r of e.expenses||[])t.has(r.id)||(t.add(r.id),n.push(r));for(let t of n)if(t.who&&!(t.who in e)&&(e[t.who]=0),t.splits)for(let n of Object.keys(t.splits))n&&!(n in e)&&(e[n]=0);let i={};for(let e of[...r.trips,...r.archivedTrips||[]])i[e.id]=h(e);for(let t of n){let n=t.euroValue||t.value||0;if(e[t.who]!==void 0&&(e[t.who]+=n),t.splits&&Object.keys(t.splits).length>0){let r=Object.values(t.splits).reduce((e,t)=>e+(Number(t)||0),0);if(r>0)for(let[i,a]of Object.entries(t.splits))e[i]!==void 0&&(e[i]-=n*Number(a)/r)}else{let r=i[t.tripId]||[],a=r.length>0?r:Array.from(new Set([t.who,...Object.keys(t.splits||{})].filter(Boolean))),o=n/Math.max(a.length,1);a.forEach(t=>{e[t]!==void 0&&(e[t]-=o)})}}let a=new Map;for(let e of[...r.trips,...r.archivedTrips||[]])a.set(e.id,e);let o=new Set,s=[];for(let e of r.settlements||[])o.has(e.id)||(o.add(e.id),s.push(e));for(let e of r.archivedTrips||[]){let t=e.settlements||[];for(let e of t)o.has(e.id)||(o.add(e.id),s.push(e))}for(let t of s){let n=a.get(t.tripId);n&&E(e,t,n)}return e}function j(e){if(!e)return[];let t=(r.expenses||[]).filter(t=>t.tripId===e.id),n=h(e),i={};n.forEach(e=>i[e]={paid:0,share:0});for(let e of t){let t=e.euroValue||e.value||0;if(i[e.who]&&(i[e.who].paid+=t),e.splits&&Object.keys(e.splits).length>0)for(let[n,r]of Object.entries(e.splits))i[n]&&(i[n].share+=t*(Number(r)/100));else{let e=t/Math.max(n.length,1);n.forEach(t=>{i[t]&&(i[t].share+=e)})}}return Object.entries(i).map(([e,t])=>({name:e,paid:t.paid,share:t.share,net:t.paid-t.share}))}function M(e){let t=0,n=0;for(let i of r.expenses||[])i.tripId===e&&i.isSettlement&&(t+=1,n+=i.euroValue||0);for(let i of r.settlements||[])i.tripId===e&&(t+=1,n+=i.euroValue||i.amount||0);return{count:t,eurTotal:n}}function N(e,t,n,r){let i=n===`global`?``:P(r),a=`
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #ffd60a; --g-to: #ff9f0a;">${S(`settlement.title`)}</h1>
            <p>${S(`settlement.subtitle`)}</p>
        </div>
        ${i}
    `;return e?`
        ${a}
        ${F(e,n)}
        ${n===`trip`?I(e,t):``}
        ${n===`history`?R(e,t):``}
        ${n===`global`?z():``}
    `:`
            ${a}
            <div class="card glass" style="text-align: center; padding: 60px 32px; margin-top: 24px; border-radius: 28px;">
                <div style="font-size: 4rem; margin-bottom: 12px;">⚖️</div>
                <h2 style="margin:0 0 6px;">${S(`settlement.noTripsTitle`)}</h2>
                <p class="text-muted">${S(`settlement.noTripsBody`)}</p>
            </div>
        `}function P(e){if(r.trips.length===0)return``;let t=r.trips.find(t=>t.id===e),n=t?M(t.id).eurTotal:0,i=r.trips.map(t=>{let n=M(t.id).eurTotal,r=n>0?` — ${y(n,`EUR`)} ${S(`settlement.settledSuffix`)}`:``;return`<option value="${d(t.id)}"${t.id===e?` selected`:``}>${d(t.name)}${r}</option>`}).join(``);return`
        <div class="settlement-trip-picker" style="margin-top: 18px; margin-bottom: 16px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <label for="settlementTripSelect" style="display:inline-flex; align-items:center; gap:8px; font-size:0.74rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-secondary); flex-shrink:0;">
                <span style="font-size:0.95rem;">⚖️</span>
                ${S(`settlement.tripPickerLabel`)}
            </label>
            <select id="settlementTripSelect" class="settlement-trip-select"
                aria-label="${S(`settlement.tripPickerAriaLabel`)}"
                style="flex:1; min-width:200px; max-width:380px; padding:10px 14px; border-radius:12px; border:1.5px solid rgba(255,159,10,0.4); background:linear-gradient(135deg, rgba(255,214,10,0.08), rgba(255,159,10,0.04)); font-size:0.92rem; font-weight:700; color: var(--text-brand-navy); cursor:pointer; outline:none; font-family:inherit; transition: border-color 0.18s ease, box-shadow 0.18s ease;">
                ${i}
            </select>
            ${t&&n>0?`
                <span style="display:inline-flex; align-items:center; padding:6px 12px; border-radius:999px; background:rgba(0,113,227,0.08); color: var(--accent-blue-deep); font-size:0.78rem; font-weight:800; flex-shrink:0;">
                    ${y(n,`EUR`)} ${S(`settlement.settledSuffix`)}
                </span>
            `:``}
        </div>
    `}function F(e,t){let n=M(e.id).count,r=(e,n,r)=>`
        <button class="settle-tab${t===e?` is-active`:``}" data-tab="${e}" type="button"
            style="background:none; border:0; padding:12px 4px; font-size:0.95rem; font-weight:${t===e?`800`:`600`}; color:${t===e?`var(--accent-blue-deep)`:`var(--text-secondary)`}; cursor:pointer; border-bottom:2px solid ${t===e?`var(--accent-blue)`:`transparent`}; margin-bottom:-1px; letter-spacing:-0.01em; transition: color 0.2s, border-color 0.2s;">
            ${n}${r!==void 0&&r>0?` <span style="background:rgba(0,113,227,0.12); color: var(--accent-blue-deep); padding:1px 6px; border-radius:999px; font-size:0.7rem; font-weight:800; margin-left:2px;">${r}</span>`:``}
        </button>
    `;return`
        <nav style="display:flex; gap:36px; border-bottom: 1px solid rgba(0,113,227,0.25); margin: 22px 0 22px; padding: 0 4px;">
            ${r(`trip`,S(`settlement.tabThisTrip`))}
            ${r(`history`,S(`settlement.tabHistory`),n)}
            ${r(`global`,S(`settlement.tabCrossTrip`))}
        </nav>
    `}function I(e,t){let{balances:n,removedFromRoster:r}=D(e),i=new Set(r||[]),a=k(n),o=j(e),s=o.reduce((e,t)=>e+t.paid,0),c=[...o].sort((e,t)=>t.paid-e.paid)[0],l=[...o].sort((e,t)=>e.net-t.net)[0],u=[...o].sort((e,t)=>t.net-e.net)[0],p=d(e?.name||`Trip`),m=s>0?`
        <div class="card glass" style="margin-bottom: 18px; padding: 22px 26px; border-radius: 28px; background: linear-gradient(135deg, rgba(255,214,10,0.05), rgba(255,159,10,0.03)); border:1px solid rgba(255,159,10,0.18);">
            <div style="display:flex; flex-wrap:wrap; gap:24px; align-items:center; justify-content:space-between;">
                <div style="min-width:0;">
                    <div style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary); margin-bottom:6px;">${S(`settlement.tripTotal`)} · ${p}</div>
                    <div style="font-size:2rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.02em;">${y(s,`EUR`)}</div>
                </div>
                ${c?`
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${S(`settlement.topPayer`)}</div>
                        <div class="stl-heading-2">${d(c.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:var(--text-secondary);">${y(c.paid,`EUR`)}</div>
                    </div>
                `:``}
                ${u&&u.net>.01?`
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${S(`settlement.topOwed`)}</div>
                        <div class="stl-heading-2">${d(u.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#1a6b3c;">+${y(u.net,`EUR`)}</div>
                    </div>
                `:``}
                ${l&&l.net<-.01?`
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#ff3b30;">${S(`settlement.topOwes`)}</div>
                        <div class="stl-heading-2">${d(l.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#a30000;">${y(l.net,`EUR`)}</div>
                    </div>
                `:``}
            </div>
        </div>
    `:``,h=Object.entries(n).map(([e,t])=>{let n=t>.01,r=t<-.01,a=i.has(e)?`<span style="margin-left:6px; padding:1px 6px; border-radius:6px; background:rgba(0,0,0,0.06); color:var(--text-secondary); font-size:0.7rem; font-weight:700; text-transform:uppercase;">removed</span>`:``;return`
            <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                <div style="width:34px; height:34px; border-radius:50%; background: ${n?`rgba(52,199,89,0.18)`:r?`rgba(255,59,48,0.18)`:`var(--surface-subtle)`}; color: ${n?`#1a6b3c`:r?`#a30000`:`var(--text-secondary)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                    ${d(e.charAt(0).toUpperCase())}
                </div>
                <div style="flex:1; min-width:0; font-weight:800; color: var(--text-brand-navy); font-size:0.95rem; overflow:hidden; text-overflow:ellipsis;">${d(e)}${a}</div>
                <div style="font-weight:800; color: ${n?`#1a6b3c`:r?`#a30000`:`var(--text-secondary)`}; font-size:1rem;">
                    ${n?`+`:``}${y(t,`EUR`)}
                </div>
            </div>
        `}).join(``)||`<p class="text-muted" style="padding: 20px; text-align:center;">${S(`settlement.emptyNoCompanions`)}</p>`,g=a.length===0?`<div style="text-align:center; padding: 40px 20px;"><div style="font-size:2.2rem; margin-bottom:8px;">🥂</div><p style="margin:0; font-weight:800; color:#1a6b3c;">${S(`settlement.allSettledTitle`)}</p><p style="margin:6px 0 0; color:var(--text-secondary); font-size:0.85rem;">${S(`settlement.allSettledBody`)}</p></div>`:a.map(n=>`
            <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:16px;">
                <div class="stl-flex-grow-truncate">
                    <div class="stl-flex-row-wrap-6">
                        <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${d(n.from)}</span>
                        <span style="color:rgba(0,0,0,0.3);">→</span>
                        <span class="stl-heading-3">${d(n.to)}</span>
                    </div>
                    <div style="font-size:1.3rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.01em; margin-top:2px;">${y(n.amount,`EUR`)}</div>
                </div>
                ${t?`
                    <button class="btn-primary settle-debt-btn" data-trip-id="${d(e.id)}" data-from="${d(n.from)}" data-to="${d(n.to)}" data-amount="${n.amount}"
                        style="padding: 8px 18px; font-size:0.85rem; border-radius: 999px; flex-shrink:0;">${S(`settlement.settleBtn`)}</button>
                `:``}
            </div>
        `).join(``);return`
        ${m}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:18px; margin-bottom:24px;">
            <div class="card glass stl-card-major">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                    <h3 class="stl-heading-1">${S(`settlement.tripBalancesTitle`)} · ${p}</h3>
                    <span class="stl-section-label">${f(`settlement.peopleCount`,Object.keys(n).length)}</span>
                </div>
                <div class="stl-flex-col-8">
                    ${h}
                </div>
            </div>
            <div class="card glass stl-card-major">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
                    <div style="min-width:0;">
                        <h3 class="stl-heading-1">${S(`settlement.suggestedPaymentsTitle`)} · ${p}</h3>
                        <div style="font-size:0.7rem; font-weight:700; color:var(--text-secondary); margin-top:3px;">${S(`settlement.suggestedPaymentsSubtitle`)}</div>
                    </div>
                    <span class="stl-section-label--shrink-0">${f(`settlement.paymentsCount`,a.length)}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${g}
                </div>
            </div>
        </div>
        ${t?`
            <div style="text-align:center; margin-bottom: 24px;">
                <button class="btn-ghost open-manual-settle-btn" data-trip-id="${d(e.id)}" type="button"
                    style="background: var(--card-bg); border:1px solid var(--border-subtle); color: var(--text-brand-navy); padding: 10px 24px; border-radius: 999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow: 0 4px 12px rgba(0,45,91,0.05);">
                    ${S(`settlement.manualSettleOpenBtn`)}
                </button>
            </div>
        `:``}
    `}function L(e){let t=[];for(let n of r.expenses||[]){if(!(n.tripId===e.id&&n.isSettlement))continue;let r=Object.keys(n.splits||{})[0]||`?`;t.push({id:n.id,source:`expense`,who:n.who||`?`,to:r,euroValue:n.euroValue||0,date:n.date||``})}for(let n of r.settlements||[]){if(n.tripId!==e.id)continue;let r=v(e,n.fromUserId)?.name,i=v(e,n.toUserId)?.name;!r||!i||t.push({id:n.id,source:`settlement`,who:r,to:i,euroValue:n.euroValue||n.amount||0,date:(n.createdAt||``).slice(0,10),method:n.method??null,note:n.note??null})}return t.sort((e,t)=>new Date(t.date).getTime()-new Date(e.date).getTime()),t}function R(e,t){let n=L(e);if(n.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">📜</div>
                <h2 style="margin:0 0 6px; color: var(--text-brand-navy);">${S(`settlement.historyEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${S(`settlement.historyEmptyBody`)}</p>
            </div>
        `;let r={};for(let e of n){let t=e.date||`undated`;r[t]||(r[t]=[]),r[t].push(e)}let i=new Date().toISOString().slice(0,10),a=new Date;a.setDate(a.getDate()-1);let o=a.toISOString().slice(0,10),s=e=>{if(e===`undated`)return S(`settlement.historyDateNoDate`);if(e===i)return S(`settlement.historyDateToday`);if(e===o)return S(`settlement.historyDateYesterday`);let t=new Date(e);return isNaN(t.getTime())?e:t.toLocaleDateString(void 0,{weekday:`short`,month:`short`,day:`numeric`,year:`numeric`})},c=Object.keys(r).sort((e,t)=>e===`undated`?1:t===`undated`?-1:t.localeCompare(e));return`
        <div class="card glass stl-card-major">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <h3 class="stl-heading-1">${S(`settlement.historyTitle`)}</h3>
                <span class="stl-section-label">${S(`settlement.historyRecorded`,{count:n.length})}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:18px;">
                ${c.map(n=>{let i=r[n],a=i.reduce((e,t)=>e+(t.euroValue||0),0);return`
                        <div>
                            <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:8px; padding: 0 4px;">
                                <h4 style="margin:0; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary);">${d(s(n))}</h4>
                                <span style="font-size:0.72rem; font-weight:700; color:var(--text-secondary);">${f(`settlement.historyDayTotalPlural`,i.length,{amount:y(a,`EUR`)})}</span>
                            </div>
                            <div class="stl-flex-col-8">
                                ${i.map(n=>{let r=(n.who||`?`).charAt(0).toUpperCase(),i=n.method&&n.source===`settlement`?`<span style="display:inline-flex; align-items:center; gap:3px; background:rgba(0,113,227,0.08); color:var(--accent-blue-deep); padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">${d(n.method.replace(/_/g,` `))}</span>`:``,a=n.note&&n.source===`settlement`?`<div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px; font-style:italic;">"${d(n.note)}"</div>`:``,o=t&&n.source===`expense`?`<button class="edit-settlement-btn" data-settlement-id="${d(n.id)}" type="button"
                                                style="background:rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.22); color: var(--accent-blue-deep); padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${S(`settlement.historyEditBtn`)}</button>`:``,s=t?`<button class="unsettle-settlement-btn" data-settlement-id="${d(n.id)}" data-source="${d(n.source)}" data-trip-id="${d(e.id)}" type="button"
                                                style="background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.22); color:#ff3b30; padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${S(`settlement.historyUnsettleBtn`)}</button>`:``;return`
                                        <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                                            <div style="width:34px; height:34px; border-radius:50%; background:rgba(52,199,89,0.12); color:#1a6b3c; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">${d(r)}</div>
                                            <div class="stl-flex-grow-truncate">
                                                <div class="stl-flex-row-wrap-6">
                                                    <span class="stl-heading-3">${d(n.who)}</span>
                                                    <span style="color:rgba(0,0,0,0.3); font-weight:600;">→</span>
                                                    <span class="stl-heading-3">${d(n.to)}</span>
                                                    <span style="display:inline-flex; align-items:center; gap:3px; background:rgba(52,199,89,0.12); color:#1a6b3c; padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${S(`settlement.historyChipSettled`)}</span>
                                                    ${i}
                                                </div>
                                                ${a}
                                            </div>
                                            <div style="font-size:1rem; font-weight:800; color:#1a6b3c; flex-shrink:0;">${y(n.euroValue||0,`EUR`)}</div>
                                            ${t&&(o||s)?`<div style="display:flex; gap:6px; flex-shrink:0;">${o}${s}</div>`:``}
                                        </div>
                                    `}).join(``)}
                            </div>
                        </div>
                    `}).join(``)}
            </div>
        </div>
    `}function z(){let e=A(),t=Object.entries(e).sort((e,t)=>t[1]-e[1]),n=Math.max(...Object.values(e).map(Math.abs),1),r=t.some(([,e])=>Math.abs(e)>.01);if(t.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">🌍</div>
                <h2 style="margin:0 0 6px; color: var(--text-brand-navy);">${S(`settlement.crossTripEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${S(`settlement.crossTripEmptyBody`)}</p>
            </div>
        `;let i=k(e);return`
        <div class="card glass stl-card-major">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                <h3 class="stl-heading-1">${S(`settlement.crossTripTitle`)}</h3>
                <span class="stl-section-label">${S(`settlement.crossTripSubtitle`)}</span>
            </div>
            <div class="stl-flex-col-8">
                ${t.map(([e,t])=>{let i=r?Math.min(Math.abs(t)/n*100,100):0,a=t>.01,o=t<-.01,s=a?`#1a6b3c`:o?`#a30000`:`var(--text-secondary)`;return`
                        <div style="display:flex; flex-direction:column; gap:10px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                            <div style="display:flex; align-items:center; gap:14px;">
                                <div style="width:34px; height:34px; border-radius:50%; background: ${a?`rgba(52,199,89,0.12)`:o?`rgba(255,59,48,0.1)`:`var(--surface-subtle)`}; color: ${a?`#1a6b3c`:o?`#a30000`:`var(--text-secondary)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                                    ${d(e.charAt(0).toUpperCase())}
                                </div>
                                <div style="flex:1; min-width:0; font-weight:800; color: var(--text-brand-navy); font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${d(e)}</div>
                                <div style="font-weight:800; color: ${s}; font-size:1rem;">
                                    ${a?`+`:``}${y(t,`EUR`)}
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
                        <h3 class="stl-heading-1">Suggested cross-trip payments</h3>
                        <div style="font-size:0.7rem; font-weight:700; color:var(--text-secondary); margin-top:3px;">Fewest payments to clear everyone across every trip you share. Record the actual settlement on whichever trip's tab fits.</div>
                    </div>
                    <span class="stl-section-label--shrink-0">${i.length} ${i.length===1?`payment`:`payments`}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${i.map(e=>`
                        <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:16px;">
                            <div class="stl-flex-grow-truncate">
                                <div class="stl-flex-row-wrap-6">
                                    <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${d(e.from)}</span>
                                    <span style="color:rgba(0,0,0,0.3);">→</span>
                                    <span class="stl-heading-3">${d(e.to)}</span>
                                </div>
                                <div style="font-size:1.3rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.01em; margin-top:2px;">${y(e.amount,`EUR`)}</div>
                            </div>
                        </div>
                    `).join(``)}
                </div>
            </div>
        `:``}
    `}async function B(e,t,n,i,o,l){if(t===n){c(S(`settlement.toastSenderEqualsReceiver`));return}if(!Number.isFinite(i)||i<=0){c(S(`settlement.toastAmountInvalid`));return}if(typeof navigator<`u`&&navigator.onLine===!1){c(S(`errors.offline`));return}let u=s(i,o,`EUR`),d=r.trips.find(t=>t.id===e),f=b(d,t)?.linkedUserId,m=b(d,n)?.linkedUserId;if(f&&m){let a=await p({tripId:e,fromUserId:f,toUserId:m,amount:i,currency:o,euroValue:u,...l?.method?{method:l.method}:{},...l?.note?{note:l.note}:{}});a.settlement?(r.settlements.push(a.settlement),_(x.STATE_CHANGED),c(`Recorded ${y(u,`EUR`)} ${t} → ${n} · notified ${n}`)):(console.warn(`[settlement] /api/settlements failed:`,a.error),c(`Settlement failed: ${a.error||`Network error`}`),_(x.STATE_CHANGED));return}let h={id:a(),tripId:e,label:S(`settlement.settlementLabel`,{from:t,to:n}),value:i,euroValue:u,currency:o,who:t,categoryId:r.categories[0]?.id??``,country:S(`settlement.expenseCountry`),date:new Date().toISOString().split(`T`)[0]??``,splits:{[n]:100},isSettlement:!0};r.expenses.push(h),_(x.STATE_CHANGED),c(`Recorded ${y(u,`EUR`)} ${t} → ${n}`)}async function V(e,t=`expense`){o({title:S(`settlement.toastUnsettleConfirmTitle`),message:S(`settlement.toastUnsettleConfirmMessage`),confirmText:S(`settlement.toastUnsettleConfirmBtn`),onConfirm:async()=>{if(t===`settlement`){let t=await i(e);if(t.error){console.warn(`[settlement] delete failed:`,t.error),c(`Couldn't undo: ${t.error||`Network error`}`);return}r.settlements=r.settlements.filter(t=>t.id!==e),_(x.STATE_CHANGED);return}r.expenses=r.expenses.filter(t=>t.id!==e),_(x.STATE_CHANGED)}})}var H=[{value:`cash`,labelKey:`settlement.methodCash`},{value:`revolut`,labelKey:`settlement.methodRevolut`},{value:`bank_transfer`,labelKey:`settlement.methodBankTransfer`},{value:`wise`,labelKey:`settlement.methodWise`},{value:`paypal`,labelKey:`settlement.methodPayPal`},{value:`custom`,labelKey:`settlement.methodCustom`}];function U(e){let t=r.trips.find(t=>t.id===e),n=h(t).map(e=>`<option value="${d(e)}">${d(e)}</option>`).join(``),i=H.map(e=>`<option value="${d(e.value)}">${d(S(e.labelKey))}</option>`).join(``),a=u(),{root:s,close:f}=l({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${S(`settlement.manualTitle`)}</h2>
            <p class="text-subtitle">${S(`settlement.manualSubtitle`)}</p>
            <form id="manualSettleForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">${d(S(`settlement.labelFrom`))}</label>
                <select id="manualSettleFrom" class="glass-input stl-card-minor-bg">${n}</select>
                <label class="form-label stl-mt-6">${d(S(`settlement.labelTo`))}</label>
                <select id="manualSettleTo" class="glass-input stl-card-minor-bg">${n}</select>
                <label class="form-label stl-mt-6">${d(S(`settlement.labelAmount`,{currency:a}))}</label>
                <input type="number" step="0.01" min="0.01" id="manualSettleAmount" class="glass-input" placeholder="0.00" required class="stl-card-minor">
                <label class="form-label stl-mt-6">${d(S(`settlement.labelMethod`))}</label>
                <select id="manualSettleMethod" class="glass-input stl-card-minor-bg">${i}</select>
                <label class="form-label stl-mt-6">${d(S(`settlement.labelNote`))} <span class="text-subtitle" style="font-weight:500;">${d(S(`settlement.labelNoteOptional`))}</span></label>
                <input type="text" id="manualSettleNote" class="glass-input" maxlength="240" placeholder="${d(S(`settlement.notePlaceholder`))}" class="stl-card-minor">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelManualSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">${d(S(`settlement.cancelBtn`))}</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">${d(S(`settlement.recordPaymentBtn`))}</button>
                </div>
            </form>
        `});m(s,`#cancelManualSettleBtn`).onclick=()=>f(),m(s,`#manualSettleForm`).onsubmit=n=>{n.preventDefault();let r=m(s,`#manualSettleFrom`).value,i=m(s,`#manualSettleTo`).value,l=parseFloat(m(s,`#manualSettleAmount`).value),u=m(s,`#manualSettleMethod`).value,d=m(s,`#manualSettleNote`).value.trim();if(r===i){c(S(`settlement.toastSenderEqualsReceiver`));return}let p=W(t,r,i,a),h=()=>{B(e,r,i,l,a,{method:u,note:d}),f()};if(l>p+.005){o({title:S(`settlement.overpayConfirmTitle`),message:p>.005?S(`settlement.overpayConfirmBody`,{amount:y(l,a),owed:y(p,a),from:r,to:i}):S(`settlement.overpayConfirmBodyNone`,{amount:y(l,a),from:r,to:i}),confirmText:S(`settlement.overpayConfirmBtn`),onConfirm:h});return}h()}}function W(e,t,n,r){if(!e)return 0;let{balances:i}=D(e),a=k(i).find(e=>e.from===t&&e.to===n);return a?s(a.amount,`EUR`,r):0}function G(e){let t=r.expenses.find(t=>t.id===e);if(!t)return;let n=h(r.trips.find(e=>e.id===t.tripId)),i=n.map(e=>`<option value="${d(e)}" ${t.who===e?`selected`:``}>${d(e)}</option>`).join(``),a=Object.keys(t.splits||{})[0],o=n.map(e=>`<option value="${d(e)}" ${a===e?`selected`:``}>${d(e)}</option>`).join(``),f=u(),{root:p,close:g}=l({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${S(`settlement.editTitle`)}</h2>
            <form id="editSettlementForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">${d(S(`settlement.labelFrom`))}</label>
                <select id="editSettleFrom" class="glass-input stl-card-minor-bg">${i}</select>
                <label class="form-label stl-mt-6">${d(S(`settlement.labelTo`))}</label>
                <select id="editSettleTo" class="glass-input stl-card-minor-bg">${o}</select>
                <label class="form-label stl-mt-6">${d(S(`settlement.labelAmount`,{currency:f}))}</label>
                <input type="number" step="0.01" min="0.01" id="editSettleAmount" value="${s(t.euroValue||0,`EUR`,f).toFixed(2)}" class="glass-input" required class="stl-card-minor">
                <label class="form-label stl-mt-6">${d(S(`settlement.labelDate`))}</label>
                <input type="date" id="editSettleDate" value="${d(t.date||``)}" class="glass-input" required class="stl-card-minor">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelEditSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">${d(S(`settlement.cancelBtn`))}</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">${d(S(`settlement.updateBtn`))}</button>
                </div>
            </form>
        `});m(p,`#cancelEditSettleBtn`).onclick=()=>g(),m(p,`#editSettlementForm`).onsubmit=e=>{e.preventDefault();let n=m(p,`#editSettleFrom`).value,r=m(p,`#editSettleTo`).value,i=parseFloat(m(p,`#editSettleAmount`).value),a=m(p,`#editSettleDate`).value;if(n===r){c(S(`settlement.toastSenderEqualsReceiver`));return}t.who=n,t.splits={[r]:100},t.value=i,t.currency=f,t.euroValue=s(i,f,`EUR`),t.date=a,t.label=S(`settlement.settlementLabel`,{from:n,to:r}),_(x.STATE_CHANGED),g()}}var K=n();function q(){let e=C(e=>e.trips),t=C(e=>e.activeTripId),n=C(e=>e.expenses),[i,a]=(0,T.useState)(`trip`),[o,s]=(0,T.useState)(()=>t||(e.length>0?e[0].id:null));(0,T.useEffect)(()=>{t&&t!==o&&s(t)},[t,o]),(0,T.useEffect)(()=>{if(o&&!e.find(e=>e.id===o)){let t=e.length>0?e[0].id:null;s(t),t&&(r.activeTripId=t,_(x.STATE_CHANGED))}},[e,o]);let c=e=>{s(e),r.activeTripId=e,_(x.STATE_CHANGED),i===`global`&&a(`trip`)},{trip:l,canEditExpenses:u}=w(o),d=(0,T.useMemo)(()=>N(l,u,i,o),[l,u,i,o,n]),f=(0,T.useRef)(null),p=e=>{let t=e.target;if(!t)return;let n=t.closest(`.settlement-trip-pill`);if(n?.dataset.tripId){c(n.dataset.tripId);return}let r=t.closest(`.settle-tab`);if(r?.dataset.tab){a(r.dataset.tab);return}let i=t.closest(`.settle-debt-btn`);if(i?.dataset.tripId&&i.dataset.from&&i.dataset.to&&i.dataset.amount&&!i.disabled){i.disabled=!0,i.textContent=S(`settlement.recordingBtn`),B(i.dataset.tripId,i.dataset.from,i.dataset.to,parseFloat(i.dataset.amount),`EUR`);return}let o=t.closest(`.open-manual-settle-btn`);if(o?.dataset.tripId){U(o.dataset.tripId);return}let s=t.closest(`.edit-settlement-btn`);if(s?.dataset.settlementId){G(s.dataset.settlementId);return}let l=t.closest(`.unsettle-settlement-btn`);if(l?.dataset.settlementId){let e=l.dataset.source===`settlement`?`settlement`:`expense`;V(l.dataset.settlementId,e);return}},m=(0,T.useRef)(c);return m.current=c,(0,T.useEffect)(()=>{let e=f.current;if(!e)return;let t=e=>{let t=e.target;if(t?.id===`settlementTripSelect`){let e=t;e.value&&m.current(e.value)}};return e.addEventListener(`change`,t),()=>e.removeEventListener(`change`,t)},[]),(0,K.jsx)(`div`,{ref:f,onClick:p,dangerouslySetInnerHTML:{__html:d}})}function J(e){g(e,(0,T.createElement)(q))}export{J as mountSettlement};
//# sourceMappingURL=mount-D5ufz1b8.js.map