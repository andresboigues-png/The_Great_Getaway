import{i as e}from"./rolldown-runtime-Kw0j5LDr.js";import{r as t,t as n}from"./vendor-react-mHyv4XDd.js";import{$t as r,Bt as i,C as a,D as o,Gt as s,M as c,Xt as l,Yt as u,cn as d,ct as f,dn as p,fn as m,ht as h,nn as g,pn as _,qt as v,sn as y,tn as b,v as x,vn as S,w as C,zt as w}from"../app.bundle.js";import{t as T}from"./store-BcyWBgJ6.js";import{n as E}from"./TripContext-o9bVw8Mt.js";var D=e(t(),1);function O(e,t,n){let r=t=>{let n=(t||``).split(/\s+/)[0];return n&&e[n]!==void 0?n:void 0},i=t.fromName||void 0;if(!i||e[i]===void 0){let a=m(n,t.fromUserId)?.name;i=a&&e[a]!==void 0?a:r(i)??i}let a=t.toName||void 0;if(!a||e[a]===void 0){let i=m(n,t.toUserId)?.name;a=i&&e[i]!==void 0?i:r(a)??a}if(!i||!a)return;e[i]===void 0&&(e[i]=0),e[a]===void 0&&(e[a]=0);let o=t.euroValue||t.amount||0;e[i]+=o,e[a]-=o}function k(e){if(!e)return{balances:{},roster:[],expenses:[],removedFromRoster:[]};let t=(y.expenses||[]).filter(t=>t.tripId===e.id),n=_(e),r=Array.from(new Set(t.flatMap(e=>[e.who,...Object.keys(e.splits||{})]).filter(Boolean))),i=Array.from(new Set([...n,...r])),a=r.filter(e=>!n.includes(e)),o={};i.forEach(e=>o[e]=0);for(let e of t){let t=e.euroValue||e.value||0;if(o[e.who]!==void 0&&(o[e.who]+=t),e.splits&&Object.keys(e.splits).length>0){let n=Object.values(e.splits).reduce((e,t)=>e+Number(t||0),0),r=n>0?n:100;for(let[n,i]of Object.entries(e.splits))o[n]!==void 0&&(o[n]-=t*(Number(i)/r))}else{let e=t/Math.max(i.length,1);i.forEach(t=>{o[t]!==void 0&&(o[t]-=e)})}}let s=(y.settlements||[]).filter(t=>t.tripId===e.id);for(let t of s)O(o,t,e);return{balances:o,roster:i,expenses:t,removedFromRoster:a}}var A=.01;function j(e){let t=[],n=[];for(let[r,i]of Object.entries(e))i>A?t.push({person:r,amount:i}):i<-A&&n.push({person:r,amount:Math.abs(i)});t.sort((e,t)=>t.amount-e.amount),n.sort((e,t)=>t.amount-e.amount);let r=[],i=0,a=0;for(;i<n.length&&a<t.length;){let e=n[i],o=t[a],s=Math.min(e.amount,o.amount);r.push({from:e.person,to:o.person,amount:s}),e.amount-=s,o.amount-=s,e.amount<A&&i++,o.amount<A&&a++}return r}function M(){let e={};for(let t of[...y.trips,...y.archivedTrips||[]])for(let n of _(t))n in e||(e[n]=0);let t=new Set,n=[];for(let e of y.expenses)t.has(e.id)||(t.add(e.id),n.push(e));for(let e of y.archivedTrips||[])for(let r of e.expenses||[])t.has(r.id)||(t.add(r.id),n.push(r));for(let t of n)if(t.who&&!(t.who in e)&&(e[t.who]=0),t.splits)for(let n of Object.keys(t.splits))n&&!(n in e)&&(e[n]=0);let r={};for(let e of[...y.trips,...y.archivedTrips||[]])r[e.id]=_(e);for(let t of n){let n=t.euroValue||t.value||0;if(e[t.who]!==void 0&&(e[t.who]+=n),t.splits&&Object.keys(t.splits).length>0){let r=Object.values(t.splits).reduce((e,t)=>e+(Number(t)||0),0);if(r>0)for(let[i,a]of Object.entries(t.splits))e[i]!==void 0&&(e[i]-=n*Number(a)/r)}else{let i=r[t.tripId]||[],a=i.length>0?i:Array.from(new Set([t.who,...Object.keys(t.splits||{})].filter(Boolean))),o=n/Math.max(a.length,1);a.forEach(t=>{e[t]!==void 0&&(e[t]-=o)})}}let i=new Map;for(let e of[...y.trips,...y.archivedTrips||[]])i.set(e.id,e);let a=new Set,o=[];for(let e of y.settlements||[])a.has(e.id)||(a.add(e.id),o.push(e));for(let e of y.archivedTrips||[]){let t=e.settlements||[];for(let e of t)a.has(e.id)||(a.add(e.id),o.push(e))}for(let t of o){let n=i.get(t.tripId);n||console.warn(`[balances] settlement`,t.id,`trip`,t.tripId,`not in local cache — using snapshot names`),O(e,t,n||null)}return e}function N(e){if(!e)return[];let t=(y.expenses||[]).filter(t=>t.tripId===e.id),n=_(e),r={};n.forEach(e=>r[e]={paid:0,share:0});for(let e of t){let t=e.euroValue||e.value||0;if(r[e.who]&&(r[e.who].paid+=t),e.splits&&Object.keys(e.splits).length>0){let n=Object.values(e.splits).reduce((e,t)=>e+Number(t),0),i=n>0?n:100;for(let[n,a]of Object.entries(e.splits))r[n]&&(r[n].share+=t*(Number(a)/i))}else{let e=t/Math.max(n.length,1);n.forEach(t=>{r[t]&&(r[t].share+=e)})}}return Object.entries(r).map(([e,t])=>({name:e,paid:t.paid,share:t.share,net:t.paid-t.share}))}function P(e){let t=0,n=0;for(let r of y.expenses||[])r.tripId===e&&r.isSettlement&&(t+=1,n+=r.euroValue||0);for(let r of y.settlements||[])r.tripId===e&&(t+=1,n+=r.euroValue||r.amount||0);return{count:t,eurTotal:n}}function F(e,t,n,r){let i=n===`global`?``:I(r),o=`
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #ffd60a; --g-to: #ff9f0a;">${a(`settlement.title`)}</h1>
            <p>${a(`settlement.subtitle`)}</p>
        </div>
        ${i}
    `;return e?`
        ${o}
        ${L(e,n)}
        ${n===`trip`?B(e,t):``}
        ${n===`history`?H(e,t):``}
        ${n===`global`?U():``}
    `:`
            ${o}
            <div class="card glass" style="text-align: center; padding: 60px 32px; margin-top: 24px; border-radius: 28px;">
                <div style="font-size: 4rem; margin-bottom: 12px;">⚖️</div>
                <h2 style="margin:0 0 6px;">${a(`settlement.noTripsTitle`)}</h2>
                <p class="text-muted">${a(`settlement.noTripsBody`)}</p>
            </div>
        `}function I(e){if(y.trips.length===0)return``;let t=y.trips.find(t=>t.id===e),n=t?P(t.id).eurTotal:0,r=y.trips.map(t=>{let n=P(t.id).eurTotal,r=n>0?` — ${b(n,`EUR`)} ${a(`settlement.settledSuffix`)}`:``;return`<option value="${s(t.id)}"${t.id===e?` selected`:``}>${s(t.name)}${r}</option>`}).join(``);return`
        <div class="settlement-trip-picker" style="margin-top: 18px; margin-bottom: 16px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <label for="settlementTripSelect" style="display:inline-flex; align-items:center; gap:8px; font-size:0.74rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-secondary); flex-shrink:0;">
                <span style="font-size:0.95rem;">⚖️</span>
                ${a(`settlement.tripPickerLabel`)}
            </label>
            <select id="settlementTripSelect" class="settlement-trip-select"
                aria-label="${a(`settlement.tripPickerAriaLabel`)}"
                style="flex:1; min-width:200px; max-width:380px; padding:10px 14px; border-radius:12px; border:1.5px solid rgba(255,159,10,0.4); background:linear-gradient(135deg, rgba(255,214,10,0.08), rgba(255,159,10,0.04)); font-size:0.92rem; font-weight:700; color: var(--text-brand-navy); cursor:pointer; outline:none; font-family:inherit; transition: border-color 0.18s ease, box-shadow 0.18s ease;">
                ${r}
            </select>
            ${t&&n>0?`
                <span style="display:inline-flex; align-items:center; padding:6px 12px; border-radius:999px; background:rgba(0,113,227,0.08); color: var(--accent-blue-deep); font-size:0.78rem; font-weight:800; flex-shrink:0;">
                    ${b(n,`EUR`)} ${a(`settlement.settledSuffix`)}
                </span>
            `:``}
        </div>
    `}function L(e,t){let n=P(e.id).count,r=(e,n,r)=>`
        <button class="settle-tab${t===e?` is-active`:``}" data-tab="${e}" type="button"
            style="background:none; border:0; padding:12px 4px; font-size:0.95rem; font-weight:${t===e?`800`:`600`}; color:${t===e?`var(--accent-blue-deep)`:`var(--text-secondary)`}; cursor:pointer; border-bottom:2px solid ${t===e?`var(--accent-blue)`:`transparent`}; margin-bottom:-1px; letter-spacing:-0.01em; transition: color 0.2s, border-color 0.2s;">
            ${n}${r!==void 0&&r>0?` <span style="background:rgba(0,113,227,0.12); color: var(--accent-blue-deep); padding:1px 6px; border-radius:999px; font-size:0.7rem; font-weight:800; margin-left:2px;">${r}</span>`:``}
        </button>
    `;return`
        <nav style="display:flex; gap:36px; border-bottom: 1px solid rgba(0,113,227,0.25); margin: 22px 0 22px; padding: 0 4px;">
            ${r(`trip`,a(`settlement.tabThisTrip`))}
            ${r(`history`,a(`settlement.tabHistory`),n)}
            ${r(`global`,a(`settlement.tabCrossTrip`))}
        </nav>
    `}function R(e){let t={};for(let n of y.expenses||[]){if(n.tripId!==e||n.isSettlement)continue;let r=(n.currency||`EUR`).toUpperCase();t[r]=(t[r]||0)+(n.euroValue||n.value||0)}let n=null,r=-1;for(let[e,i]of Object.entries(t))i>r&&(r=i,n=e);return n}function z(e,t){return!t||t===g().toUpperCase()?``:`<span style="display:block; font-size:0.72rem; font-weight:600; color:var(--text-secondary); margin-top:1px;">≈ ${s(x(r(Math.abs(e),`EUR`,t),t))}</span>`}function B(e,t){let{balances:n,removedFromRoster:r}=k(e),i=new Set(r||[]),o=j(n),c=R(e.id),l=N(e),u=l.reduce((e,t)=>e+t.paid,0),d=[...l].sort((e,t)=>t.paid-e.paid)[0],f=[...l].sort((e,t)=>e.net-t.net)[0],p=[...l].sort((e,t)=>t.net-e.net)[0],m=s(e?.name||`Trip`),h=u>0?`
        <div class="card glass" style="margin-bottom: 18px; padding: 22px 26px; border-radius: 28px; background: linear-gradient(135deg, rgba(255,214,10,0.05), rgba(255,159,10,0.03)); border:1px solid rgba(255,159,10,0.18);">
            <div style="display:flex; flex-wrap:wrap; gap:24px; align-items:center; justify-content:space-between;">
                <div style="min-width:0;">
                    <div style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary); margin-bottom:6px;">${a(`settlement.tripTotal`)} · ${m}</div>
                    <div style="font-size:2rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.02em;">${b(u,`EUR`)}</div>
                </div>
                ${d?`
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${a(`settlement.topPayer`)}</div>
                        <div class="stl-heading-2">${s(d.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:var(--text-secondary);">${b(d.paid,`EUR`)}</div>
                    </div>
                `:``}
                ${p&&p.net>.01?`
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${a(`settlement.topOwed`)}</div>
                        <div class="stl-heading-2">${s(p.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#1a6b3c;">+${b(p.net,`EUR`)}</div>
                    </div>
                `:``}
                ${f&&f.net<-.01?`
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#ff3b30;">${a(`settlement.topOwes`)}</div>
                        <div class="stl-heading-2">${s(f.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#a30000;">${b(f.net,`EUR`)}</div>
                    </div>
                `:``}
            </div>
        </div>
    `:``,g=Object.entries(n).map(([e,t])=>{let n=t>.01,r=t<-.01,a=i.has(e)?`<span style="margin-left:6px; padding:1px 6px; border-radius:6px; background:rgba(0,0,0,0.06); color:var(--text-secondary); font-size:0.7rem; font-weight:700; text-transform:uppercase;">removed</span>`:``;return`
            <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                <div style="width:34px; height:34px; border-radius:50%; background: ${n?`rgba(52,199,89,0.18)`:r?`rgba(255,59,48,0.18)`:`var(--surface-subtle)`}; color: ${n?`#1a6b3c`:r?`#a30000`:`var(--text-secondary)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                    ${s(e.charAt(0).toUpperCase())}
                </div>
                <div style="flex:1; min-width:0; font-weight:800; color: var(--text-brand-navy); font-size:0.95rem; overflow:hidden; text-overflow:ellipsis;">${s(e)}${a}</div>
                <div style="font-weight:800; color: ${n?`#1a6b3c`:r?`#a30000`:`var(--text-secondary)`}; font-size:1rem; text-align:right;">
                    ${n?`+`:``}${b(t,`EUR`)}${z(t,c)}
                </div>
            </div>
        `}).join(``)||`<p class="text-muted" style="padding: 20px; text-align:center;">${a(`settlement.emptyNoCompanions`)}</p>`,_=o.length===0?`<div style="text-align:center; padding: 40px 20px;"><div style="font-size:2.2rem; margin-bottom:8px;">🥂</div><p style="margin:0; font-weight:800; color:#1a6b3c;">${a(`settlement.allSettledTitle`)}</p><p style="margin:6px 0 0; color:var(--text-secondary); font-size:0.85rem;">${a(`settlement.allSettledBody`)}</p></div>`:o.map(n=>`
            <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:16px;">
                <div class="stl-flex-grow-truncate">
                    <div class="stl-flex-row-wrap-6">
                        <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${s(n.from)}</span>
                        <span style="color:rgba(0,0,0,0.3);">→</span>
                        <span class="stl-heading-3">${s(n.to)}</span>
                    </div>
                    <div style="font-size:1.3rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.01em; margin-top:2px;">${b(n.amount,`EUR`)}${z(n.amount,c)}</div>
                </div>
                ${t?`
                    <button class="btn-primary settle-debt-btn" data-trip-id="${s(e.id)}" data-from="${s(n.from)}" data-to="${s(n.to)}" data-amount="${n.amount}"
                        style="padding: 8px 18px; font-size:0.85rem; border-radius: 999px; flex-shrink:0;">${a(`settlement.settleBtn`)}</button>
                `:``}
            </div>
        `).join(``);return`
        ${h}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:18px; margin-bottom:24px;">
            <div class="card glass stl-card-major">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                    <h3 class="stl-heading-1">${a(`settlement.tripBalancesTitle`)} · ${m}</h3>
                    <span class="stl-section-label">${C(`settlement.peopleCount`,Object.keys(n).length)}</span>
                </div>
                <div class="stl-flex-col-8">
                    ${g}
                </div>
            </div>
            <div class="card glass stl-card-major">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
                    <div style="min-width:0;">
                        <h3 class="stl-heading-1">${a(`settlement.suggestedPaymentsTitle`)} · ${m}</h3>
                        <div style="font-size:0.7rem; font-weight:700; color:var(--text-secondary); margin-top:3px;">${a(`settlement.suggestedPaymentsSubtitle`)}</div>
                    </div>
                    <span class="stl-section-label--shrink-0">${C(`settlement.paymentsCount`,o.length)}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${_}
                </div>
            </div>
        </div>
        ${t?`
            <div style="text-align:center; margin-bottom: 24px;">
                <button class="btn-ghost open-manual-settle-btn" data-trip-id="${s(e.id)}" type="button"
                    style="background: var(--card-bg); border:1px solid var(--border-subtle); color: var(--text-brand-navy); padding: 10px 24px; border-radius: 999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow: 0 4px 12px rgba(0,45,91,0.05);">
                    ${a(`settlement.manualSettleOpenBtn`)}
                </button>
            </div>
        `:``}
    `}function V(e){let t=[];for(let n of y.expenses||[]){if(!(n.tripId===e.id&&n.isSettlement))continue;let r=Object.keys(n.splits||{})[0]||`?`;t.push({id:n.id,source:`expense`,who:n.who||`?`,to:r,euroValue:n.euroValue||0,date:n.date||``})}for(let n of y.settlements||[]){if(n.tripId!==e.id)continue;let r=n.fromName||m(e,n.fromUserId)?.name,i=n.toName||m(e,n.toUserId)?.name;!r||!i||t.push({id:n.id,source:`settlement`,who:r,to:i,euroValue:n.euroValue||n.amount||0,date:(n.createdAt||``).slice(0,10),method:n.method??null,note:n.note??null})}return t.sort((e,t)=>new Date(t.date).getTime()-new Date(e.date).getTime()),t}function H(e,t){let n=V(e);if(n.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">📜</div>
                <h2 style="margin:0 0 6px; color: var(--text-brand-navy);">${a(`settlement.historyEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${a(`settlement.historyEmptyBody`)}</p>
            </div>
        `;let r={};for(let e of n){let t=e.date||`undated`;r[t]||(r[t]=[]),r[t].push(e)}let i=new Date().toISOString().slice(0,10),o=new Date;o.setDate(o.getDate()-1);let c=o.toISOString().slice(0,10),l=e=>{if(e===`undated`)return a(`settlement.historyDateNoDate`);if(e===i)return a(`settlement.historyDateToday`);if(e===c)return a(`settlement.historyDateYesterday`);let t=new Date(e);return isNaN(t.getTime())?e:t.toLocaleDateString(void 0,{weekday:`short`,month:`short`,day:`numeric`,year:`numeric`})},u=Object.keys(r).sort((e,t)=>e===`undated`?1:t===`undated`?-1:t.localeCompare(e));return`
        <div class="card glass stl-card-major">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <h3 class="stl-heading-1">${a(`settlement.historyTitle`)}</h3>
                <span class="stl-section-label">${a(`settlement.historyRecorded`,{count:n.length})}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:18px;">
                ${u.map(n=>{let i=r[n],o=i.reduce((e,t)=>e+(t.euroValue||0),0);return`
                        <div>
                            <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:8px; padding: 0 4px;">
                                <h4 style="margin:0; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary);">${s(l(n))}</h4>
                                <span style="font-size:0.72rem; font-weight:700; color:var(--text-secondary);">${C(`settlement.historyDayTotalPlural`,i.length,{amount:b(o,`EUR`)})}</span>
                            </div>
                            <div class="stl-flex-col-8">
                                ${i.map(n=>{let r=(n.who||`?`).charAt(0).toUpperCase(),i=n.method&&n.source===`settlement`?`<span style="display:inline-flex; align-items:center; gap:3px; background:rgba(0,113,227,0.08); color:var(--accent-blue-deep); padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">${s(n.method.replace(/_/g,` `))}</span>`:``,o=n.note&&n.source===`settlement`?`<div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px; font-style:italic;">"${s(n.note)}"</div>`:``,c=t&&n.source===`expense`?`<button class="edit-settlement-btn" data-settlement-id="${s(n.id)}" type="button"
                                                style="background:rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.22); color: var(--accent-blue-deep); padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${a(`settlement.historyEditBtn`)}</button>`:``,l=t?`<button class="unsettle-settlement-btn" data-settlement-id="${s(n.id)}" data-source="${s(n.source)}" data-trip-id="${s(e.id)}" type="button"
                                                style="background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.22); color:#ff3b30; padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${a(`settlement.historyUnsettleBtn`)}</button>`:``;return`
                                        <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                                            <div style="width:34px; height:34px; border-radius:50%; background:rgba(52,199,89,0.12); color:#1a6b3c; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">${s(r)}</div>
                                            <div class="stl-flex-grow-truncate">
                                                <div class="stl-flex-row-wrap-6">
                                                    <span class="stl-heading-3">${s(n.who)}</span>
                                                    <span style="color:rgba(0,0,0,0.3); font-weight:600;">→</span>
                                                    <span class="stl-heading-3">${s(n.to)}</span>
                                                    <span style="display:inline-flex; align-items:center; gap:3px; background:rgba(52,199,89,0.12); color:#1a6b3c; padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${a(`settlement.historyChipSettled`)}</span>
                                                    ${i}
                                                </div>
                                                ${o}
                                            </div>
                                            <div style="font-size:1rem; font-weight:800; color:#1a6b3c; flex-shrink:0;">${b(n.euroValue||0,`EUR`)}</div>
                                            ${t&&(c||l)?`<div style="display:flex; gap:6px; flex-shrink:0;">${c}${l}</div>`:``}
                                        </div>
                                    `}).join(``)}
                            </div>
                        </div>
                    `}).join(``)}
            </div>
        </div>
    `}function U(){let e=M(),t=Object.entries(e).sort((e,t)=>t[1]-e[1]),n=Math.max(...Object.values(e).map(Math.abs),1),r=t.some(([,e])=>Math.abs(e)>.01);if(t.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">🌍</div>
                <h2 style="margin:0 0 6px; color: var(--text-brand-navy);">${a(`settlement.crossTripEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${a(`settlement.crossTripEmptyBody`)}</p>
            </div>
        `;let i=j(e);return`
        <div class="card glass stl-card-major">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                <h3 class="stl-heading-1">${a(`settlement.crossTripTitle`)}</h3>
                <span class="stl-section-label">${a(`settlement.crossTripSubtitle`)}</span>
            </div>
            <div class="stl-flex-col-8">
                ${t.map(([e,t])=>{let i=r?Math.min(Math.abs(t)/n*100,100):0,a=t>.01,o=t<-.01,c=a?`#1a6b3c`:o?`#a30000`:`var(--text-secondary)`;return`
                        <div style="display:flex; flex-direction:column; gap:10px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                            <div style="display:flex; align-items:center; gap:14px;">
                                <div style="width:34px; height:34px; border-radius:50%; background: ${a?`rgba(52,199,89,0.12)`:o?`rgba(255,59,48,0.1)`:`var(--surface-subtle)`}; color: ${a?`#1a6b3c`:o?`#a30000`:`var(--text-secondary)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                                    ${s(e.charAt(0).toUpperCase())}
                                </div>
                                <div style="flex:1; min-width:0; font-weight:800; color: var(--text-brand-navy); font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${s(e)}</div>
                                <div style="font-weight:800; color: ${c}; font-size:1rem;">
                                    ${a?`+`:``}${b(t,`EUR`)}
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
                                    <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${s(e.from)}</span>
                                    <span style="color:rgba(0,0,0,0.3);">→</span>
                                    <span class="stl-heading-3">${s(e.to)}</span>
                                </div>
                                <div style="font-size:1.3rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.01em; margin-top:2px;">${b(e.amount,`EUR`)}</div>
                            </div>
                        </div>
                    `).join(``)}
                </div>
            </div>
        `:``}
    `}async function W(e,t,n,i,s,c){if(t===n){l(a(`settlement.toastSenderEqualsReceiver`));return}if(!Number.isFinite(i)||i<=0){l(a(`settlement.toastAmountInvalid`));return}if(typeof navigator<`u`&&navigator.onLine===!1){l(a(`errors.offline`));return}let u=r(i,s,`EUR`),m=y.trips.find(t=>t.id===e),h=p(m,t)?.linkedUserId,g=p(m,n)?.linkedUserId;if(h&&g){let r=await o({tripId:e,fromUserId:h,toUserId:g,amount:i,currency:s,euroValue:u,...c?.method?{method:c.method}:{},...c?.note?{note:c.note}:{}});r.settlement?(y.settlements.push(r.settlement),d(S.STATE_CHANGED),l(a(`settlement.toastRecordedNotified`,{amount:b(u,`EUR`),from:t,to:n}))):(console.warn(`[settlement] /api/settlements failed:`,r.error),l(a(`settlement.toastSettlementFailed`,{error:r.error||a(`settlement.toastSettlementFailedNetwork`)})),d(S.STATE_CHANGED));return}let _={id:v(),tripId:e,label:a(`settlement.settlementLabel`,{from:t,to:n}),value:i,euroValue:u,currency:s,who:t,categoryId:y.categories[0]?.id??``,country:a(`settlement.expenseCountry`),date:new Date().toISOString().split(`T`)[0]??``,splits:{[n]:100},isSettlement:!0};y.expenses.push(_),d(S.STATE_CHANGED),f(_),l(a(`settlement.toastRecorded`,{amount:b(u,`EUR`),from:t,to:n}))}async function G(e,t=`expense`){w({title:a(`settlement.toastUnsettleConfirmTitle`),message:a(`settlement.toastUnsettleConfirmMessage`),confirmText:a(`settlement.toastUnsettleConfirmBtn`),onConfirm:async()=>{if(t===`settlement`){let t=await c(e);if(t.error){console.warn(`[settlement] delete failed:`,t.error),l(`Couldn't undo: ${t.error||`Network error`}`);return}y.settlements=y.settlements.filter(t=>t.id!==e),d(S.STATE_CHANGED);return}y.expenses=y.expenses.filter(t=>t.id!==e),d(S.STATE_CHANGED)}})}var K=[{value:`cash`,labelKey:`settlement.methodCash`},{value:`revolut`,labelKey:`settlement.methodRevolut`},{value:`bank_transfer`,labelKey:`settlement.methodBankTransfer`},{value:`wise`,labelKey:`settlement.methodWise`},{value:`paypal`,labelKey:`settlement.methodPayPal`},{value:`custom`,labelKey:`settlement.methodCustom`}];function q(e){let t=y.trips.find(t=>t.id===e),n=_(t).map(e=>`<option value="${s(e)}">${s(e)}</option>`).join(``),r=K.map(e=>`<option value="${s(e.value)}">${s(a(e.labelKey))}</option>`).join(``),o=g(),{root:c,close:d}=i({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${a(`settlement.manualTitle`)}</h2>
            <p class="text-subtitle">${a(`settlement.manualSubtitle`)}</p>
            <form id="manualSettleForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">${s(a(`settlement.labelFrom`))}</label>
                <select id="manualSettleFrom" class="glass-input stl-card-minor-bg">${n}</select>
                <label class="form-label stl-mt-6">${s(a(`settlement.labelTo`))}</label>
                <select id="manualSettleTo" class="glass-input stl-card-minor-bg">${n}</select>
                <label class="form-label stl-mt-6">${s(a(`settlement.labelAmount`,{currency:o}))}</label>
                <input type="number" step="0.01" min="0.01" id="manualSettleAmount" class="glass-input" placeholder="0.00" required class="stl-card-minor">
                <label class="form-label stl-mt-6">${s(a(`settlement.labelMethod`))}</label>
                <select id="manualSettleMethod" class="glass-input stl-card-minor-bg">${r}</select>
                <label class="form-label stl-mt-6">${s(a(`settlement.labelNote`))} <span class="text-subtitle" style="font-weight:500;">${s(a(`settlement.labelNoteOptional`))}</span></label>
                <input type="text" id="manualSettleNote" class="glass-input" maxlength="240" placeholder="${s(a(`settlement.notePlaceholder`))}" class="stl-card-minor">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelManualSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">${s(a(`settlement.cancelBtn`))}</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">${s(a(`settlement.recordPaymentBtn`))}</button>
                </div>
            </form>
        `});u(c,`#cancelManualSettleBtn`).onclick=()=>d(),u(c,`#manualSettleForm`).onsubmit=n=>{n.preventDefault();let r=u(c,`#manualSettleFrom`).value,i=u(c,`#manualSettleTo`).value,s=parseFloat(u(c,`#manualSettleAmount`).value),f=u(c,`#manualSettleMethod`).value,p=u(c,`#manualSettleNote`).value.trim();if(r===i){l(a(`settlement.toastSenderEqualsReceiver`));return}let m=J(t,r,i,o),h=()=>{W(e,r,i,s,o,{method:f,note:p}),d()};if(s>m+.005){w({title:a(`settlement.overpayConfirmTitle`),message:m>.005?a(`settlement.overpayConfirmBody`,{amount:b(s,o),owed:b(m,o),from:r,to:i}):a(`settlement.overpayConfirmBodyNone`,{amount:b(s,o),from:r,to:i}),confirmText:a(`settlement.overpayConfirmBtn`),onConfirm:h});return}h()}}function J(e,t,n,i){if(!e)return 0;let{balances:a}=k(e),o=j(a).find(e=>e.from===t&&e.to===n);return o?r(o.amount,`EUR`,i):0}function Y(e){let t=y.expenses.find(t=>t.id===e);if(!t)return;let n=_(y.trips.find(e=>e.id===t.tripId)),o=n.map(e=>`<option value="${s(e)}" ${t.who===e?`selected`:``}>${s(e)}</option>`).join(``),c=Object.keys(t.splits||{})[0],p=n.map(e=>`<option value="${s(e)}" ${c===e?`selected`:``}>${s(e)}</option>`).join(``),m=g(),{root:h,close:v}=i({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${a(`settlement.editTitle`)}</h2>
            <form id="editSettlementForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">${s(a(`settlement.labelFrom`))}</label>
                <select id="editSettleFrom" class="glass-input stl-card-minor-bg">${o}</select>
                <label class="form-label stl-mt-6">${s(a(`settlement.labelTo`))}</label>
                <select id="editSettleTo" class="glass-input stl-card-minor-bg">${p}</select>
                <label class="form-label stl-mt-6">${s(a(`settlement.labelAmount`,{currency:m}))}</label>
                <input type="number" step="0.01" min="0.01" id="editSettleAmount" value="${r(t.euroValue||0,`EUR`,m).toFixed(2)}" class="glass-input" required class="stl-card-minor">
                <label class="form-label stl-mt-6">${s(a(`settlement.labelDate`))}</label>
                <input type="date" id="editSettleDate" value="${s(t.date||``)}" class="glass-input" required class="stl-card-minor">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelEditSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">${s(a(`settlement.cancelBtn`))}</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">${s(a(`settlement.updateBtn`))}</button>
                </div>
            </form>
        `});u(h,`#cancelEditSettleBtn`).onclick=()=>v(),u(h,`#editSettlementForm`).onsubmit=e=>{e.preventDefault();let n=u(h,`#editSettleFrom`).value,i=u(h,`#editSettleTo`).value,o=parseFloat(u(h,`#editSettleAmount`).value),s=u(h,`#editSettleDate`).value;if(n===i){l(a(`settlement.toastSenderEqualsReceiver`));return}t.who=n,t.splits={[i]:100},t.value=o,t.currency=m,t.euroValue=r(o,m,`EUR`),t.date=s,t.label=a(`settlement.settlementLabel`,{from:n,to:i}),d(S.STATE_CHANGED),f(t),v()}}var X=n();function Z(){let e=T(e=>e.trips),t=T(e=>e.activeTripId),n=T(e=>e.expenses),[r,i]=(0,D.useState)(`trip`),[o,s]=(0,D.useState)(()=>t||(e.length>0?e[0].id:null));(0,D.useEffect)(()=>{t&&t!==o&&s(t)},[t,o]),(0,D.useEffect)(()=>{if(o&&!e.find(e=>e.id===o)){let t=e.length>0?e[0].id:null;s(t),t&&(y.activeTripId=t,d(S.STATE_CHANGED))}},[e,o]);let c=e=>{s(e),y.activeTripId=e,d(S.STATE_CHANGED),r===`global`&&i(`trip`)},{trip:l,canEditExpenses:u}=E(o),f=(0,D.useMemo)(()=>F(l,u,r,o),[l,u,r,o,n]),p=(0,D.useRef)(null),m=e=>{let t=e.target;if(!t)return;let n=t.closest(`.settlement-trip-pill`);if(n?.dataset.tripId){c(n.dataset.tripId);return}let r=t.closest(`.settle-tab`);if(r?.dataset.tab){i(r.dataset.tab);return}let o=t.closest(`.settle-debt-btn`);if(o?.dataset.tripId&&o.dataset.from&&o.dataset.to&&o.dataset.amount&&!o.disabled){o.disabled=!0,o.textContent=a(`settlement.recordingBtn`),W(o.dataset.tripId,o.dataset.from,o.dataset.to,parseFloat(o.dataset.amount),`EUR`);return}let s=t.closest(`.open-manual-settle-btn`);if(s?.dataset.tripId){q(s.dataset.tripId);return}let l=t.closest(`.edit-settlement-btn`);if(l?.dataset.settlementId){Y(l.dataset.settlementId);return}let u=t.closest(`.unsettle-settlement-btn`);if(u?.dataset.settlementId){let e=u.dataset.source===`settlement`?`settlement`:`expense`;G(u.dataset.settlementId,e);return}},h=(0,D.useRef)(c);return h.current=c,(0,D.useEffect)(()=>{let e=p.current;if(!e)return;let t=e=>{let t=e.target;if(t?.id===`settlementTripSelect`){let e=t;e.value&&h.current(e.value)}};return e.addEventListener(`change`,t),()=>e.removeEventListener(`change`,t)},[]),(0,X.jsx)(`div`,{ref:p,onClick:m,dangerouslySetInnerHTML:{__html:f}})}function Q(e){h(e,(0,D.createElement)(Z))}export{Q as mountSettlement};
//# sourceMappingURL=mount-D0sVTN-V.js.map