import{i as e}from"./rolldown-runtime-Kw0j5LDr.js";import{r as t,t as n}from"./vendor-react-mHyv4XDd.js";import{$t as r,C as i,E as a,Gt as o,Kt as s,Lt as c,Qt as l,Rt as u,S as d,Ut as f,Xt as p,an as m,cn as h,hn as g,in as _,j as v,ln as y,ot as b,pt as x,qt as S,un as C}from"../app.bundle.js";import{t as w}from"./store-DHRMnKmx.js";import{n as T}from"./TripContext-CKSkYwou.js";var E=e(t(),1);function D(e,t,n){let r=t=>{let n=(t||``).split(/\s+/)[0];return n&&e[n]!==void 0?n:void 0},i=t.fromName||void 0;if(!i||e[i]===void 0){let a=y(n,t.fromUserId)?.name;i=a&&e[a]!==void 0?a:r(i)??i}let a=t.toName||void 0;if(!a||e[a]===void 0){let i=y(n,t.toUserId)?.name;a=i&&e[i]!==void 0?i:r(a)??a}if(!i||!a)return;e[i]===void 0&&(e[i]=0),e[a]===void 0&&(e[a]=0);let o=t.euroValue||t.amount||0;e[i]+=o,e[a]-=o}function O(e){if(!e)return{balances:{},roster:[],expenses:[],removedFromRoster:[]};let t=(_.expenses||[]).filter(t=>t.tripId===e.id),n=C(e),r=Array.from(new Set(t.flatMap(e=>[e.who,...Object.keys(e.splits||{})]).filter(Boolean))),i=Array.from(new Set([...n,...r])),a=r.filter(e=>!n.includes(e)),o={};i.forEach(e=>o[e]=0);for(let e of t){let t=e.euroValue||e.value||0;if(o[e.who]!==void 0&&(o[e.who]+=t),e.splits&&Object.keys(e.splits).length>0){let n=Object.values(e.splits).reduce((e,t)=>e+Number(t||0),0),r=n>0?n:100;for(let[n,i]of Object.entries(e.splits))o[n]!==void 0&&(o[n]-=t*(Number(i)/r))}else{let e=t/Math.max(i.length,1);i.forEach(t=>{o[t]!==void 0&&(o[t]-=e)})}}let s=(_.settlements||[]).filter(t=>t.tripId===e.id);for(let t of s)D(o,t,e);return{balances:o,roster:i,expenses:t,removedFromRoster:a}}var k=.01;function A(e){let t=[],n=[];for(let[r,i]of Object.entries(e))i>k?t.push({person:r,amount:i}):i<-k&&n.push({person:r,amount:Math.abs(i)});t.sort((e,t)=>t.amount-e.amount),n.sort((e,t)=>t.amount-e.amount);let r=[],i=0,a=0;for(;i<n.length&&a<t.length;){let e=n[i],o=t[a],s=Math.min(e.amount,o.amount);r.push({from:e.person,to:o.person,amount:s}),e.amount-=s,o.amount-=s,e.amount<k&&i++,o.amount<k&&a++}return r}function j(){let e={};for(let t of[..._.trips,..._.archivedTrips||[]])for(let n of C(t))n in e||(e[n]=0);let t=new Set,n=[];for(let e of _.expenses)t.has(e.id)||(t.add(e.id),n.push(e));for(let e of _.archivedTrips||[])for(let r of e.expenses||[])t.has(r.id)||(t.add(r.id),n.push(r));for(let t of n)if(t.who&&!(t.who in e)&&(e[t.who]=0),t.splits)for(let n of Object.keys(t.splits))n&&!(n in e)&&(e[n]=0);let r={};for(let e of[..._.trips,..._.archivedTrips||[]])r[e.id]=C(e);for(let t of n){let n=t.euroValue||t.value||0;if(e[t.who]!==void 0&&(e[t.who]+=n),t.splits&&Object.keys(t.splits).length>0){let r=Object.values(t.splits).reduce((e,t)=>e+(Number(t)||0),0);if(r>0)for(let[i,a]of Object.entries(t.splits))e[i]!==void 0&&(e[i]-=n*Number(a)/r)}else{let i=r[t.tripId]||[],a=i.length>0?i:Array.from(new Set([t.who,...Object.keys(t.splits||{})].filter(Boolean))),o=n/Math.max(a.length,1);a.forEach(t=>{e[t]!==void 0&&(e[t]-=o)})}}let i=new Map;for(let e of[..._.trips,..._.archivedTrips||[]])i.set(e.id,e);let a=new Set,o=[];for(let e of _.settlements||[])a.has(e.id)||(a.add(e.id),o.push(e));for(let e of _.archivedTrips||[]){let t=e.settlements||[];for(let e of t)a.has(e.id)||(a.add(e.id),o.push(e))}for(let t of o){let n=i.get(t.tripId);n||console.warn(`[balances] settlement`,t.id,`trip`,t.tripId,`not in local cache — using snapshot names`),D(e,t,n||null)}return e}function M(e){if(!e)return[];let t=(_.expenses||[]).filter(t=>t.tripId===e.id),n=C(e),r={};n.forEach(e=>r[e]={paid:0,share:0});for(let e of t){let t=e.euroValue||e.value||0;if(r[e.who]&&(r[e.who].paid+=t),e.splits&&Object.keys(e.splits).length>0){let n=Object.values(e.splits).reduce((e,t)=>e+Number(t),0),i=n>0?n:100;for(let[n,a]of Object.entries(e.splits))r[n]&&(r[n].share+=t*(Number(a)/i))}else{let e=t/Math.max(n.length,1);n.forEach(t=>{r[t]&&(r[t].share+=e)})}}return Object.entries(r).map(([e,t])=>({name:e,paid:t.paid,share:t.share,net:t.paid-t.share}))}function N(e){let t=0,n=0;for(let r of _.expenses||[])r.tripId===e&&r.isSettlement&&(t+=1,n+=r.euroValue||0);for(let r of _.settlements||[])r.tripId===e&&(t+=1,n+=r.euroValue||r.amount||0);return{count:t,eurTotal:n}}function P(e,t,n,r){let i=n===`global`?``:F(r),a=`
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #ffd60a; --g-to: #ff9f0a;">${d(`settlement.title`)}</h1>
            <p>${d(`settlement.subtitle`)}</p>
        </div>
        ${i}
    `;return e?`
        ${a}
        ${I(e,n)}
        ${n===`trip`?L(e,t):``}
        ${n===`history`?z(e,t):``}
        ${n===`global`?B():``}
    `:`
            ${a}
            <div class="card glass" style="text-align: center; padding: 60px 32px; margin-top: 24px; border-radius: 28px;">
                <div style="font-size: 4rem; margin-bottom: 12px;">⚖️</div>
                <h2 style="margin:0 0 6px;">${d(`settlement.noTripsTitle`)}</h2>
                <p class="text-muted">${d(`settlement.noTripsBody`)}</p>
            </div>
        `}function F(e){if(_.trips.length===0)return``;let t=_.trips.find(t=>t.id===e),n=t?N(t.id).eurTotal:0,r=_.trips.map(t=>{let n=N(t.id).eurTotal,r=n>0?` — ${l(n,`EUR`)} ${d(`settlement.settledSuffix`)}`:``;return`<option value="${f(t.id)}"${t.id===e?` selected`:``}>${f(t.name)}${r}</option>`}).join(``);return`
        <div class="settlement-trip-picker" style="margin-top: 18px; margin-bottom: 16px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <label for="settlementTripSelect" style="display:inline-flex; align-items:center; gap:8px; font-size:0.74rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-secondary); flex-shrink:0;">
                <span style="font-size:0.95rem;">⚖️</span>
                ${d(`settlement.tripPickerLabel`)}
            </label>
            <select id="settlementTripSelect" class="settlement-trip-select"
                aria-label="${d(`settlement.tripPickerAriaLabel`)}"
                style="flex:1; min-width:200px; max-width:380px; padding:10px 14px; border-radius:12px; border:1.5px solid rgba(255,159,10,0.4); background:linear-gradient(135deg, rgba(255,214,10,0.08), rgba(255,159,10,0.04)); font-size:0.92rem; font-weight:700; color: var(--text-brand-navy); cursor:pointer; outline:none; font-family:inherit; transition: border-color 0.18s ease, box-shadow 0.18s ease;">
                ${r}
            </select>
            ${t&&n>0?`
                <span style="display:inline-flex; align-items:center; padding:6px 12px; border-radius:999px; background:rgba(0,113,227,0.08); color: var(--accent-blue-deep); font-size:0.78rem; font-weight:800; flex-shrink:0;">
                    ${l(n,`EUR`)} ${d(`settlement.settledSuffix`)}
                </span>
            `:``}
        </div>
    `}function I(e,t){let n=N(e.id).count,r=(e,n,r)=>`
        <button class="settle-tab${t===e?` is-active`:``}" data-tab="${e}" type="button"
            style="background:none; border:0; padding:12px 4px; font-size:0.95rem; font-weight:${t===e?`800`:`600`}; color:${t===e?`var(--accent-blue-deep)`:`var(--text-secondary)`}; cursor:pointer; border-bottom:2px solid ${t===e?`var(--accent-blue)`:`transparent`}; margin-bottom:-1px; letter-spacing:-0.01em; transition: color 0.2s, border-color 0.2s;">
            ${n}${r!==void 0&&r>0?` <span style="background:rgba(0,113,227,0.12); color: var(--accent-blue-deep); padding:1px 6px; border-radius:999px; font-size:0.7rem; font-weight:800; margin-left:2px;">${r}</span>`:``}
        </button>
    `;return`
        <nav style="display:flex; gap:36px; border-bottom: 1px solid rgba(0,113,227,0.25); margin: 22px 0 22px; padding: 0 4px;">
            ${r(`trip`,d(`settlement.tabThisTrip`))}
            ${r(`history`,d(`settlement.tabHistory`),n)}
            ${r(`global`,d(`settlement.tabCrossTrip`))}
        </nav>
    `}function L(e,t){let{balances:n,removedFromRoster:r}=O(e),a=new Set(r||[]),o=A(n),s=M(e),c=s.reduce((e,t)=>e+t.paid,0),u=[...s].sort((e,t)=>t.paid-e.paid)[0],p=[...s].sort((e,t)=>e.net-t.net)[0],m=[...s].sort((e,t)=>t.net-e.net)[0],h=f(e?.name||`Trip`),g=c>0?`
        <div class="card glass" style="margin-bottom: 18px; padding: 22px 26px; border-radius: 28px; background: linear-gradient(135deg, rgba(255,214,10,0.05), rgba(255,159,10,0.03)); border:1px solid rgba(255,159,10,0.18);">
            <div style="display:flex; flex-wrap:wrap; gap:24px; align-items:center; justify-content:space-between;">
                <div style="min-width:0;">
                    <div style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary); margin-bottom:6px;">${d(`settlement.tripTotal`)} · ${h}</div>
                    <div style="font-size:2rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.02em;">${l(c,`EUR`)}</div>
                </div>
                ${u?`
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${d(`settlement.topPayer`)}</div>
                        <div class="stl-heading-2">${f(u.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:var(--text-secondary);">${l(u.paid,`EUR`)}</div>
                    </div>
                `:``}
                ${m&&m.net>.01?`
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${d(`settlement.topOwed`)}</div>
                        <div class="stl-heading-2">${f(m.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#1a6b3c;">+${l(m.net,`EUR`)}</div>
                    </div>
                `:``}
                ${p&&p.net<-.01?`
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#ff3b30;">${d(`settlement.topOwes`)}</div>
                        <div class="stl-heading-2">${f(p.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#a30000;">${l(p.net,`EUR`)}</div>
                    </div>
                `:``}
            </div>
        </div>
    `:``,_=Object.entries(n).map(([e,t])=>{let n=t>.01,r=t<-.01,i=a.has(e)?`<span style="margin-left:6px; padding:1px 6px; border-radius:6px; background:rgba(0,0,0,0.06); color:var(--text-secondary); font-size:0.7rem; font-weight:700; text-transform:uppercase;">removed</span>`:``;return`
            <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                <div style="width:34px; height:34px; border-radius:50%; background: ${n?`rgba(52,199,89,0.18)`:r?`rgba(255,59,48,0.18)`:`var(--surface-subtle)`}; color: ${n?`#1a6b3c`:r?`#a30000`:`var(--text-secondary)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                    ${f(e.charAt(0).toUpperCase())}
                </div>
                <div style="flex:1; min-width:0; font-weight:800; color: var(--text-brand-navy); font-size:0.95rem; overflow:hidden; text-overflow:ellipsis;">${f(e)}${i}</div>
                <div style="font-weight:800; color: ${n?`#1a6b3c`:r?`#a30000`:`var(--text-secondary)`}; font-size:1rem;">
                    ${n?`+`:``}${l(t,`EUR`)}
                </div>
            </div>
        `}).join(``)||`<p class="text-muted" style="padding: 20px; text-align:center;">${d(`settlement.emptyNoCompanions`)}</p>`,v=o.length===0?`<div style="text-align:center; padding: 40px 20px;"><div style="font-size:2.2rem; margin-bottom:8px;">🥂</div><p style="margin:0; font-weight:800; color:#1a6b3c;">${d(`settlement.allSettledTitle`)}</p><p style="margin:6px 0 0; color:var(--text-secondary); font-size:0.85rem;">${d(`settlement.allSettledBody`)}</p></div>`:o.map(n=>`
            <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:16px;">
                <div class="stl-flex-grow-truncate">
                    <div class="stl-flex-row-wrap-6">
                        <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${f(n.from)}</span>
                        <span style="color:rgba(0,0,0,0.3);">→</span>
                        <span class="stl-heading-3">${f(n.to)}</span>
                    </div>
                    <div style="font-size:1.3rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.01em; margin-top:2px;">${l(n.amount,`EUR`)}</div>
                </div>
                ${t?`
                    <button class="btn-primary settle-debt-btn" data-trip-id="${f(e.id)}" data-from="${f(n.from)}" data-to="${f(n.to)}" data-amount="${n.amount}"
                        style="padding: 8px 18px; font-size:0.85rem; border-radius: 999px; flex-shrink:0;">${d(`settlement.settleBtn`)}</button>
                `:``}
            </div>
        `).join(``);return`
        ${g}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:18px; margin-bottom:24px;">
            <div class="card glass stl-card-major">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                    <h3 class="stl-heading-1">${d(`settlement.tripBalancesTitle`)} · ${h}</h3>
                    <span class="stl-section-label">${i(`settlement.peopleCount`,Object.keys(n).length)}</span>
                </div>
                <div class="stl-flex-col-8">
                    ${_}
                </div>
            </div>
            <div class="card glass stl-card-major">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
                    <div style="min-width:0;">
                        <h3 class="stl-heading-1">${d(`settlement.suggestedPaymentsTitle`)} · ${h}</h3>
                        <div style="font-size:0.7rem; font-weight:700; color:var(--text-secondary); margin-top:3px;">${d(`settlement.suggestedPaymentsSubtitle`)}</div>
                    </div>
                    <span class="stl-section-label--shrink-0">${i(`settlement.paymentsCount`,o.length)}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${v}
                </div>
            </div>
        </div>
        ${t?`
            <div style="text-align:center; margin-bottom: 24px;">
                <button class="btn-ghost open-manual-settle-btn" data-trip-id="${f(e.id)}" type="button"
                    style="background: var(--card-bg); border:1px solid var(--border-subtle); color: var(--text-brand-navy); padding: 10px 24px; border-radius: 999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow: 0 4px 12px rgba(0,45,91,0.05);">
                    ${d(`settlement.manualSettleOpenBtn`)}
                </button>
            </div>
        `:``}
    `}function R(e){let t=[];for(let n of _.expenses||[]){if(!(n.tripId===e.id&&n.isSettlement))continue;let r=Object.keys(n.splits||{})[0]||`?`;t.push({id:n.id,source:`expense`,who:n.who||`?`,to:r,euroValue:n.euroValue||0,date:n.date||``})}for(let n of _.settlements||[]){if(n.tripId!==e.id)continue;let r=n.fromName||y(e,n.fromUserId)?.name,i=n.toName||y(e,n.toUserId)?.name;!r||!i||t.push({id:n.id,source:`settlement`,who:r,to:i,euroValue:n.euroValue||n.amount||0,date:(n.createdAt||``).slice(0,10),method:n.method??null,note:n.note??null})}return t.sort((e,t)=>new Date(t.date).getTime()-new Date(e.date).getTime()),t}function z(e,t){let n=R(e);if(n.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">📜</div>
                <h2 style="margin:0 0 6px; color: var(--text-brand-navy);">${d(`settlement.historyEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${d(`settlement.historyEmptyBody`)}</p>
            </div>
        `;let r={};for(let e of n){let t=e.date||`undated`;r[t]||(r[t]=[]),r[t].push(e)}let a=new Date().toISOString().slice(0,10),o=new Date;o.setDate(o.getDate()-1);let s=o.toISOString().slice(0,10),c=e=>{if(e===`undated`)return d(`settlement.historyDateNoDate`);if(e===a)return d(`settlement.historyDateToday`);if(e===s)return d(`settlement.historyDateYesterday`);let t=new Date(e);return isNaN(t.getTime())?e:t.toLocaleDateString(void 0,{weekday:`short`,month:`short`,day:`numeric`,year:`numeric`})},u=Object.keys(r).sort((e,t)=>e===`undated`?1:t===`undated`?-1:t.localeCompare(e));return`
        <div class="card glass stl-card-major">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <h3 class="stl-heading-1">${d(`settlement.historyTitle`)}</h3>
                <span class="stl-section-label">${d(`settlement.historyRecorded`,{count:n.length})}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:18px;">
                ${u.map(n=>{let a=r[n],o=a.reduce((e,t)=>e+(t.euroValue||0),0);return`
                        <div>
                            <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:8px; padding: 0 4px;">
                                <h4 style="margin:0; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary);">${f(c(n))}</h4>
                                <span style="font-size:0.72rem; font-weight:700; color:var(--text-secondary);">${i(`settlement.historyDayTotalPlural`,a.length,{amount:l(o,`EUR`)})}</span>
                            </div>
                            <div class="stl-flex-col-8">
                                ${a.map(n=>{let r=(n.who||`?`).charAt(0).toUpperCase(),i=n.method&&n.source===`settlement`?`<span style="display:inline-flex; align-items:center; gap:3px; background:rgba(0,113,227,0.08); color:var(--accent-blue-deep); padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">${f(n.method.replace(/_/g,` `))}</span>`:``,a=n.note&&n.source===`settlement`?`<div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px; font-style:italic;">"${f(n.note)}"</div>`:``,o=t&&n.source===`expense`?`<button class="edit-settlement-btn" data-settlement-id="${f(n.id)}" type="button"
                                                style="background:rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.22); color: var(--accent-blue-deep); padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${d(`settlement.historyEditBtn`)}</button>`:``,s=t?`<button class="unsettle-settlement-btn" data-settlement-id="${f(n.id)}" data-source="${f(n.source)}" data-trip-id="${f(e.id)}" type="button"
                                                style="background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.22); color:#ff3b30; padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${d(`settlement.historyUnsettleBtn`)}</button>`:``;return`
                                        <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                                            <div style="width:34px; height:34px; border-radius:50%; background:rgba(52,199,89,0.12); color:#1a6b3c; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">${f(r)}</div>
                                            <div class="stl-flex-grow-truncate">
                                                <div class="stl-flex-row-wrap-6">
                                                    <span class="stl-heading-3">${f(n.who)}</span>
                                                    <span style="color:rgba(0,0,0,0.3); font-weight:600;">→</span>
                                                    <span class="stl-heading-3">${f(n.to)}</span>
                                                    <span style="display:inline-flex; align-items:center; gap:3px; background:rgba(52,199,89,0.12); color:#1a6b3c; padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${d(`settlement.historyChipSettled`)}</span>
                                                    ${i}
                                                </div>
                                                ${a}
                                            </div>
                                            <div style="font-size:1rem; font-weight:800; color:#1a6b3c; flex-shrink:0;">${l(n.euroValue||0,`EUR`)}</div>
                                            ${t&&(o||s)?`<div style="display:flex; gap:6px; flex-shrink:0;">${o}${s}</div>`:``}
                                        </div>
                                    `}).join(``)}
                            </div>
                        </div>
                    `}).join(``)}
            </div>
        </div>
    `}function B(){let e=j(),t=Object.entries(e).sort((e,t)=>t[1]-e[1]),n=Math.max(...Object.values(e).map(Math.abs),1),r=t.some(([,e])=>Math.abs(e)>.01);if(t.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">🌍</div>
                <h2 style="margin:0 0 6px; color: var(--text-brand-navy);">${d(`settlement.crossTripEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${d(`settlement.crossTripEmptyBody`)}</p>
            </div>
        `;let i=A(e);return`
        <div class="card glass stl-card-major">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                <h3 class="stl-heading-1">${d(`settlement.crossTripTitle`)}</h3>
                <span class="stl-section-label">${d(`settlement.crossTripSubtitle`)}</span>
            </div>
            <div class="stl-flex-col-8">
                ${t.map(([e,t])=>{let i=r?Math.min(Math.abs(t)/n*100,100):0,a=t>.01,o=t<-.01,s=a?`#1a6b3c`:o?`#a30000`:`var(--text-secondary)`;return`
                        <div style="display:flex; flex-direction:column; gap:10px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                            <div style="display:flex; align-items:center; gap:14px;">
                                <div style="width:34px; height:34px; border-radius:50%; background: ${a?`rgba(52,199,89,0.12)`:o?`rgba(255,59,48,0.1)`:`var(--surface-subtle)`}; color: ${a?`#1a6b3c`:o?`#a30000`:`var(--text-secondary)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                                    ${f(e.charAt(0).toUpperCase())}
                                </div>
                                <div style="flex:1; min-width:0; font-weight:800; color: var(--text-brand-navy); font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f(e)}</div>
                                <div style="font-weight:800; color: ${s}; font-size:1rem;">
                                    ${a?`+`:``}${l(t,`EUR`)}
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
                                    <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${f(e.from)}</span>
                                    <span style="color:rgba(0,0,0,0.3);">→</span>
                                    <span class="stl-heading-3">${f(e.to)}</span>
                                </div>
                                <div style="font-size:1.3rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.01em; margin-top:2px;">${l(e.amount,`EUR`)}</div>
                            </div>
                        </div>
                    `).join(``)}
                </div>
            </div>
        `:``}
    `}async function V(e,t,n,r,i,s){if(t===n){S(d(`settlement.toastSenderEqualsReceiver`));return}if(!Number.isFinite(r)||r<=0){S(d(`settlement.toastAmountInvalid`));return}if(typeof navigator<`u`&&navigator.onLine===!1){S(d(`errors.offline`));return}let c=p(r,i,`EUR`),u=_.trips.find(t=>t.id===e),f=h(u,t)?.linkedUserId,v=h(u,n)?.linkedUserId;if(f&&v){let o=await a({tripId:e,fromUserId:f,toUserId:v,amount:r,currency:i,euroValue:c,...s?.method?{method:s.method}:{},...s?.note?{note:s.note}:{}});o.settlement?(_.settlements.push(o.settlement),m(g.STATE_CHANGED),S(d(`settlement.toastRecordedNotified`,{amount:l(c,`EUR`),from:t,to:n}))):(console.warn(`[settlement] /api/settlements failed:`,o.error),S(d(`settlement.toastSettlementFailed`,{error:o.error||d(`settlement.toastSettlementFailedNetwork`)})),m(g.STATE_CHANGED));return}let y={id:o(),tripId:e,label:d(`settlement.settlementLabel`,{from:t,to:n}),value:r,euroValue:c,currency:i,who:t,categoryId:_.categories[0]?.id??``,country:d(`settlement.expenseCountry`),date:new Date().toISOString().split(`T`)[0]??``,splits:{[n]:100},isSettlement:!0};_.expenses.push(y),m(g.STATE_CHANGED),b(y),S(d(`settlement.toastRecorded`,{amount:l(c,`EUR`),from:t,to:n}))}async function H(e,t=`expense`){c({title:d(`settlement.toastUnsettleConfirmTitle`),message:d(`settlement.toastUnsettleConfirmMessage`),confirmText:d(`settlement.toastUnsettleConfirmBtn`),onConfirm:async()=>{if(t===`settlement`){let t=await v(e);if(t.error){console.warn(`[settlement] delete failed:`,t.error),S(`Couldn't undo: ${t.error||`Network error`}`);return}_.settlements=_.settlements.filter(t=>t.id!==e),m(g.STATE_CHANGED);return}_.expenses=_.expenses.filter(t=>t.id!==e),m(g.STATE_CHANGED)}})}var U=[{value:`cash`,labelKey:`settlement.methodCash`},{value:`revolut`,labelKey:`settlement.methodRevolut`},{value:`bank_transfer`,labelKey:`settlement.methodBankTransfer`},{value:`wise`,labelKey:`settlement.methodWise`},{value:`paypal`,labelKey:`settlement.methodPayPal`},{value:`custom`,labelKey:`settlement.methodCustom`}];function W(e){let t=_.trips.find(t=>t.id===e),n=C(t).map(e=>`<option value="${f(e)}">${f(e)}</option>`).join(``),i=U.map(e=>`<option value="${f(e.value)}">${f(d(e.labelKey))}</option>`).join(``),a=r(),{root:o,close:p}=u({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${d(`settlement.manualTitle`)}</h2>
            <p class="text-subtitle">${d(`settlement.manualSubtitle`)}</p>
            <form id="manualSettleForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">${f(d(`settlement.labelFrom`))}</label>
                <select id="manualSettleFrom" class="glass-input stl-card-minor-bg">${n}</select>
                <label class="form-label stl-mt-6">${f(d(`settlement.labelTo`))}</label>
                <select id="manualSettleTo" class="glass-input stl-card-minor-bg">${n}</select>
                <label class="form-label stl-mt-6">${f(d(`settlement.labelAmount`,{currency:a}))}</label>
                <input type="number" step="0.01" min="0.01" id="manualSettleAmount" class="glass-input" placeholder="0.00" required class="stl-card-minor">
                <label class="form-label stl-mt-6">${f(d(`settlement.labelMethod`))}</label>
                <select id="manualSettleMethod" class="glass-input stl-card-minor-bg">${i}</select>
                <label class="form-label stl-mt-6">${f(d(`settlement.labelNote`))} <span class="text-subtitle" style="font-weight:500;">${f(d(`settlement.labelNoteOptional`))}</span></label>
                <input type="text" id="manualSettleNote" class="glass-input" maxlength="240" placeholder="${f(d(`settlement.notePlaceholder`))}" class="stl-card-minor">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelManualSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">${f(d(`settlement.cancelBtn`))}</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">${f(d(`settlement.recordPaymentBtn`))}</button>
                </div>
            </form>
        `});s(o,`#cancelManualSettleBtn`).onclick=()=>p(),s(o,`#manualSettleForm`).onsubmit=n=>{n.preventDefault();let r=s(o,`#manualSettleFrom`).value,i=s(o,`#manualSettleTo`).value,u=parseFloat(s(o,`#manualSettleAmount`).value),f=s(o,`#manualSettleMethod`).value,m=s(o,`#manualSettleNote`).value.trim();if(r===i){S(d(`settlement.toastSenderEqualsReceiver`));return}let h=G(t,r,i,a),g=()=>{V(e,r,i,u,a,{method:f,note:m}),p()};if(u>h+.005){c({title:d(`settlement.overpayConfirmTitle`),message:h>.005?d(`settlement.overpayConfirmBody`,{amount:l(u,a),owed:l(h,a),from:r,to:i}):d(`settlement.overpayConfirmBodyNone`,{amount:l(u,a),from:r,to:i}),confirmText:d(`settlement.overpayConfirmBtn`),onConfirm:g});return}g()}}function G(e,t,n,r){if(!e)return 0;let{balances:i}=O(e),a=A(i).find(e=>e.from===t&&e.to===n);return a?p(a.amount,`EUR`,r):0}function K(e){let t=_.expenses.find(t=>t.id===e);if(!t)return;let n=C(_.trips.find(e=>e.id===t.tripId)),i=n.map(e=>`<option value="${f(e)}" ${t.who===e?`selected`:``}>${f(e)}</option>`).join(``),a=Object.keys(t.splits||{})[0],o=n.map(e=>`<option value="${f(e)}" ${a===e?`selected`:``}>${f(e)}</option>`).join(``),c=r(),{root:l,close:h}=u({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${d(`settlement.editTitle`)}</h2>
            <form id="editSettlementForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">${f(d(`settlement.labelFrom`))}</label>
                <select id="editSettleFrom" class="glass-input stl-card-minor-bg">${i}</select>
                <label class="form-label stl-mt-6">${f(d(`settlement.labelTo`))}</label>
                <select id="editSettleTo" class="glass-input stl-card-minor-bg">${o}</select>
                <label class="form-label stl-mt-6">${f(d(`settlement.labelAmount`,{currency:c}))}</label>
                <input type="number" step="0.01" min="0.01" id="editSettleAmount" value="${p(t.euroValue||0,`EUR`,c).toFixed(2)}" class="glass-input" required class="stl-card-minor">
                <label class="form-label stl-mt-6">${f(d(`settlement.labelDate`))}</label>
                <input type="date" id="editSettleDate" value="${f(t.date||``)}" class="glass-input" required class="stl-card-minor">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelEditSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">${f(d(`settlement.cancelBtn`))}</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">${f(d(`settlement.updateBtn`))}</button>
                </div>
            </form>
        `});s(l,`#cancelEditSettleBtn`).onclick=()=>h(),s(l,`#editSettlementForm`).onsubmit=e=>{e.preventDefault();let n=s(l,`#editSettleFrom`).value,r=s(l,`#editSettleTo`).value,i=parseFloat(s(l,`#editSettleAmount`).value),a=s(l,`#editSettleDate`).value;if(n===r){S(d(`settlement.toastSenderEqualsReceiver`));return}t.who=n,t.splits={[r]:100},t.value=i,t.currency=c,t.euroValue=p(i,c,`EUR`),t.date=a,t.label=d(`settlement.settlementLabel`,{from:n,to:r}),m(g.STATE_CHANGED),b(t),h()}}var q=n();function J(){let e=w(e=>e.trips),t=w(e=>e.activeTripId),n=w(e=>e.expenses),[r,i]=(0,E.useState)(`trip`),[a,o]=(0,E.useState)(()=>t||(e.length>0?e[0].id:null));(0,E.useEffect)(()=>{t&&t!==a&&o(t)},[t,a]),(0,E.useEffect)(()=>{if(a&&!e.find(e=>e.id===a)){let t=e.length>0?e[0].id:null;o(t),t&&(_.activeTripId=t,m(g.STATE_CHANGED))}},[e,a]);let s=e=>{o(e),_.activeTripId=e,m(g.STATE_CHANGED),r===`global`&&i(`trip`)},{trip:c,canEditExpenses:l}=T(a),u=(0,E.useMemo)(()=>P(c,l,r,a),[c,l,r,a,n]),f=(0,E.useRef)(null),p=e=>{let t=e.target;if(!t)return;let n=t.closest(`.settlement-trip-pill`);if(n?.dataset.tripId){s(n.dataset.tripId);return}let r=t.closest(`.settle-tab`);if(r?.dataset.tab){i(r.dataset.tab);return}let a=t.closest(`.settle-debt-btn`);if(a?.dataset.tripId&&a.dataset.from&&a.dataset.to&&a.dataset.amount&&!a.disabled){a.disabled=!0,a.textContent=d(`settlement.recordingBtn`),V(a.dataset.tripId,a.dataset.from,a.dataset.to,parseFloat(a.dataset.amount),`EUR`);return}let o=t.closest(`.open-manual-settle-btn`);if(o?.dataset.tripId){W(o.dataset.tripId);return}let c=t.closest(`.edit-settlement-btn`);if(c?.dataset.settlementId){K(c.dataset.settlementId);return}let l=t.closest(`.unsettle-settlement-btn`);if(l?.dataset.settlementId){let e=l.dataset.source===`settlement`?`settlement`:`expense`;H(l.dataset.settlementId,e);return}},h=(0,E.useRef)(s);return h.current=s,(0,E.useEffect)(()=>{let e=f.current;if(!e)return;let t=e=>{let t=e.target;if(t?.id===`settlementTripSelect`){let e=t;e.value&&h.current(e.value)}};return e.addEventListener(`change`,t),()=>e.removeEventListener(`change`,t)},[]),(0,q.jsx)(`div`,{ref:f,onClick:p,dangerouslySetInnerHTML:{__html:u}})}function Y(e){x(e,(0,E.createElement)(J))}export{Y as mountSettlement};
//# sourceMappingURL=mount-ClZLRw2O.js.map