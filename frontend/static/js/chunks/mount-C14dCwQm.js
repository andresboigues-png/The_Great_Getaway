import{i as e}from"./rolldown-runtime-Kw0j5LDr.js";import{r as t,t as n}from"./vendor-react-mHyv4XDd.js";import{C as r,D as i,Jt as a,Kt as o,M as s,Qt as c,Rt as l,Wt as u,Yt as d,_n as f,dn as p,en as m,fn as h,mt as g,on as _,sn as v,st as y,tn as b,un as x,v as S,w as C,zt as w}from"../app.bundle.js";import{t as T}from"./store-BLi6pfgZ.js";import{n as E}from"./TripContext-C6C3_Qe_.js";var D=e(t(),1);function O(e,t,n){let r=t=>{let n=(t||``).split(/\s+/)[0];return n&&e[n]!==void 0?n:void 0},i=t.fromName||void 0;if(!i||e[i]===void 0){let a=p(n,t.fromUserId)?.name;i=a&&e[a]!==void 0?a:r(i)??i}let a=t.toName||void 0;if(!a||e[a]===void 0){let i=p(n,t.toUserId)?.name;a=i&&e[i]!==void 0?i:r(a)??a}if(!i||!a)return;e[i]===void 0&&(e[i]=0),e[a]===void 0&&(e[a]=0);let o=t.euroValue||t.amount||0;e[i]+=o,e[a]-=o}function k(e){if(!e)return{balances:{},roster:[],expenses:[],removedFromRoster:[]};let t=(_.expenses||[]).filter(t=>t.tripId===e.id),n=h(e),r=Array.from(new Set(t.flatMap(e=>[e.who,...Object.keys(e.splits||{})]).filter(Boolean))),i=Array.from(new Set([...n,...r])),a=r.filter(e=>!n.includes(e)),o={};i.forEach(e=>o[e]=0);for(let e of t){let t=e.euroValue||e.value||0;if(o[e.who]!==void 0&&(o[e.who]+=t),e.splits&&Object.keys(e.splits).length>0){let n=Object.values(e.splits).reduce((e,t)=>e+Number(t||0),0),r=n>0?n:100;for(let[n,i]of Object.entries(e.splits))o[n]!==void 0&&(o[n]-=t*(Number(i)/r))}else{let e=t/Math.max(i.length,1);i.forEach(t=>{o[t]!==void 0&&(o[t]-=e)})}}let s=(_.settlements||[]).filter(t=>t.tripId===e.id);for(let t of s)O(o,t,e);return{balances:o,roster:i,expenses:t,removedFromRoster:a}}var A=.01;function j(e){let t=[],n=[];for(let[r,i]of Object.entries(e))i>A?t.push({person:r,amount:i}):i<-A&&n.push({person:r,amount:Math.abs(i)});t.sort((e,t)=>t.amount-e.amount),n.sort((e,t)=>t.amount-e.amount);let r=[],i=0,a=0;for(;i<n.length&&a<t.length;){let e=n[i],o=t[a],s=Math.min(e.amount,o.amount);r.push({from:e.person,to:o.person,amount:s}),e.amount-=s,o.amount-=s,e.amount<A&&i++,o.amount<A&&a++}return r}function M(){let e={};for(let t of[..._.trips,..._.archivedTrips||[]])for(let n of h(t))n in e||(e[n]=0);let t=new Set,n=[];for(let e of _.expenses)t.has(e.id)||(t.add(e.id),n.push(e));for(let e of _.archivedTrips||[])for(let r of e.expenses||[])t.has(r.id)||(t.add(r.id),n.push(r));for(let t of n)if(t.who&&!(t.who in e)&&(e[t.who]=0),t.splits)for(let n of Object.keys(t.splits))n&&!(n in e)&&(e[n]=0);let r={};for(let e of[..._.trips,..._.archivedTrips||[]])r[e.id]=h(e);for(let t of n){let n=t.euroValue||t.value||0;if(e[t.who]!==void 0&&(e[t.who]+=n),t.splits&&Object.keys(t.splits).length>0){let r=Object.values(t.splits).reduce((e,t)=>e+(Number(t)||0),0);if(r>0)for(let[i,a]of Object.entries(t.splits))e[i]!==void 0&&(e[i]-=n*Number(a)/r)}else{let i=r[t.tripId]||[],a=i.length>0?i:Array.from(new Set([t.who,...Object.keys(t.splits||{})].filter(Boolean))),o=n/Math.max(a.length,1);a.forEach(t=>{e[t]!==void 0&&(e[t]-=o)})}}let i=new Map;for(let e of[..._.trips,..._.archivedTrips||[]])i.set(e.id,e);let a=new Set,o=[];for(let e of _.settlements||[])a.has(e.id)||(a.add(e.id),o.push(e));for(let e of _.archivedTrips||[]){let t=e.settlements||[];for(let e of t)a.has(e.id)||(a.add(e.id),o.push(e))}for(let t of o){let n=i.get(t.tripId);n||console.warn(`[balances] settlement`,t.id,`trip`,t.tripId,`not in local cache — using snapshot names`),O(e,t,n||null)}return e}function N(e){if(!e)return[];let t=(_.expenses||[]).filter(t=>t.tripId===e.id),n=h(e),r={};n.forEach(e=>r[e]={paid:0,share:0});for(let e of t){let t=e.euroValue||e.value||0;if(r[e.who]&&(r[e.who].paid+=t),e.splits&&Object.keys(e.splits).length>0){let n=Object.values(e.splits).reduce((e,t)=>e+Number(t),0),i=n>0?n:100;for(let[n,a]of Object.entries(e.splits))r[n]&&(r[n].share+=t*(Number(a)/i))}else{let e=t/Math.max(n.length,1);n.forEach(t=>{r[t]&&(r[t].share+=e)})}}return Object.entries(r).map(([e,t])=>({name:e,paid:t.paid,share:t.share,net:t.paid-t.share}))}function P(e){let t=0,n=0;for(let r of _.expenses||[])r.tripId===e&&r.isSettlement&&(t+=1,n+=r.euroValue||0);for(let r of _.settlements||[])r.tripId===e&&(t+=1,n+=r.euroValue||r.amount||0);return{count:t,eurTotal:n}}function F(e,t,n,i){let a=n===`global`?``:I(i),o=`
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #ffd60a; --g-to: #ff9f0a;">${r(`settlement.title`)}</h1>
            <p>${r(`settlement.subtitle`)}</p>
        </div>
        ${a}
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
                <h2 style="margin:0 0 6px;">${r(`settlement.noTripsTitle`)}</h2>
                <p class="text-muted">${r(`settlement.noTripsBody`)}</p>
            </div>
        `}function I(e){if(_.trips.length===0)return``;let t=_.trips.find(t=>t.id===e),n=t?P(t.id).eurTotal:0,i=_.trips.map(t=>{let n=P(t.id).eurTotal,i=n>0?` — ${m(n,`EUR`)} ${r(`settlement.settledSuffix`)}`:``;return`<option value="${u(t.id)}"${t.id===e?` selected`:``}>${u(t.name)}${i}</option>`}).join(``);return`
        <div class="settlement-trip-picker" style="margin-top: 18px; margin-bottom: 16px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <label for="settlementTripSelect" style="display:inline-flex; align-items:center; gap:8px; font-size:0.74rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-secondary); flex-shrink:0;">
                <span style="font-size:0.95rem;">⚖️</span>
                ${r(`settlement.tripPickerLabel`)}
            </label>
            <select id="settlementTripSelect" class="settlement-trip-select"
                aria-label="${r(`settlement.tripPickerAriaLabel`)}"
                style="flex:1; min-width:200px; max-width:380px; padding:10px 14px; border-radius:12px; border:1.5px solid rgba(255,159,10,0.4); background:linear-gradient(135deg, rgba(255,214,10,0.08), rgba(255,159,10,0.04)); font-size:0.92rem; font-weight:700; color: var(--text-brand-navy); cursor:pointer; outline:none; font-family:inherit; transition: border-color 0.18s ease, box-shadow 0.18s ease;">
                ${i}
            </select>
            ${t&&n>0?`
                <span style="display:inline-flex; align-items:center; padding:6px 12px; border-radius:999px; background:rgba(0,113,227,0.08); color: var(--accent-blue-deep); font-size:0.78rem; font-weight:800; flex-shrink:0;">
                    ${m(n,`EUR`)} ${r(`settlement.settledSuffix`)}
                </span>
            `:``}
        </div>
    `}function L(e,t){let n=P(e.id).count,i=(e,n,r)=>`
        <button class="settle-tab${t===e?` is-active`:``}" data-tab="${e}" type="button"
            style="background:none; border:0; padding:12px 4px; font-size:0.95rem; font-weight:${t===e?`800`:`600`}; color:${t===e?`var(--accent-blue-deep)`:`var(--text-secondary)`}; cursor:pointer; border-bottom:2px solid ${t===e?`var(--accent-blue)`:`transparent`}; margin-bottom:-1px; letter-spacing:-0.01em; transition: color 0.2s, border-color 0.2s;">
            ${n}${r!==void 0&&r>0?` <span style="background:rgba(0,113,227,0.12); color: var(--accent-blue-deep); padding:1px 6px; border-radius:999px; font-size:0.7rem; font-weight:800; margin-left:2px;">${r}</span>`:``}
        </button>
    `;return`
        <nav style="display:flex; gap:36px; border-bottom: 1px solid rgba(0,113,227,0.25); margin: 22px 0 22px; padding: 0 4px;">
            ${i(`trip`,r(`settlement.tabThisTrip`))}
            ${i(`history`,r(`settlement.tabHistory`),n)}
            ${i(`global`,r(`settlement.tabCrossTrip`))}
        </nav>
    `}function R(e){let t={};for(let n of _.expenses||[]){if(n.tripId!==e||n.isSettlement)continue;let r=(n.currency||`EUR`).toUpperCase();t[r]=(t[r]||0)+(n.euroValue||n.value||0)}let n=null,r=-1;for(let[e,i]of Object.entries(t))i>r&&(r=i,n=e);return n}function z(e,t){return!t||t===b()?``:`<span style="display:block; font-size:0.72rem; font-weight:600; color:var(--text-secondary); margin-top:1px;">≈ ${u(S(c(Math.abs(e),`EUR`,t),t))}</span>`}function B(e,t){let{balances:n,removedFromRoster:i}=k(e),a=new Set(i||[]),o=j(n),s=R(e.id),c=N(e),l=c.reduce((e,t)=>e+t.paid,0),d=[...c].sort((e,t)=>t.paid-e.paid)[0],f=[...c].sort((e,t)=>e.net-t.net)[0],p=[...c].sort((e,t)=>t.net-e.net)[0],h=u(e?.name||`Trip`),g=l>0?`
        <div class="card glass" style="margin-bottom: 18px; padding: 22px 26px; border-radius: 28px; background: linear-gradient(135deg, rgba(255,214,10,0.05), rgba(255,159,10,0.03)); border:1px solid rgba(255,159,10,0.18);">
            <div style="display:flex; flex-wrap:wrap; gap:24px; align-items:center; justify-content:space-between;">
                <div style="min-width:0;">
                    <div style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary); margin-bottom:6px;">${r(`settlement.tripTotal`)} · ${h}</div>
                    <div style="font-size:2rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.02em;">${m(l,`EUR`)}</div>
                </div>
                ${d?`
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${r(`settlement.topPayer`)}</div>
                        <div class="stl-heading-2">${u(d.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:var(--text-secondary);">${m(d.paid,`EUR`)}</div>
                    </div>
                `:``}
                ${p&&p.net>.01?`
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${r(`settlement.topOwed`)}</div>
                        <div class="stl-heading-2">${u(p.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#1a6b3c;">+${m(p.net,`EUR`)}</div>
                    </div>
                `:``}
                ${f&&f.net<-.01?`
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#ff3b30;">${r(`settlement.topOwes`)}</div>
                        <div class="stl-heading-2">${u(f.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#a30000;">${m(f.net,`EUR`)}</div>
                    </div>
                `:``}
            </div>
        </div>
    `:``,_=Object.entries(n).map(([e,t])=>{let n=t>.01,r=t<-.01,i=a.has(e)?`<span style="margin-left:6px; padding:1px 6px; border-radius:6px; background:rgba(0,0,0,0.06); color:var(--text-secondary); font-size:0.7rem; font-weight:700; text-transform:uppercase;">removed</span>`:``;return`
            <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                <div style="width:34px; height:34px; border-radius:50%; background: ${n?`rgba(52,199,89,0.18)`:r?`rgba(255,59,48,0.18)`:`var(--surface-subtle)`}; color: ${n?`#1a6b3c`:r?`#a30000`:`var(--text-secondary)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                    ${u(e.charAt(0).toUpperCase())}
                </div>
                <div style="flex:1; min-width:0; font-weight:800; color: var(--text-brand-navy); font-size:0.95rem; overflow:hidden; text-overflow:ellipsis;">${u(e)}${i}</div>
                <div style="font-weight:800; color: ${n?`#1a6b3c`:r?`#a30000`:`var(--text-secondary)`}; font-size:1rem; text-align:right;">
                    ${n?`+`:``}${m(t,`EUR`)}${z(t,s)}
                </div>
            </div>
        `}).join(``)||`<p class="text-muted" style="padding: 20px; text-align:center;">${r(`settlement.emptyNoCompanions`)}</p>`,v=o.length===0?`<div style="text-align:center; padding: 40px 20px;"><div style="font-size:2.2rem; margin-bottom:8px;">🥂</div><p style="margin:0; font-weight:800; color:#1a6b3c;">${r(`settlement.allSettledTitle`)}</p><p style="margin:6px 0 0; color:var(--text-secondary); font-size:0.85rem;">${r(`settlement.allSettledBody`)}</p></div>`:o.map(n=>`
            <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:16px;">
                <div class="stl-flex-grow-truncate">
                    <div class="stl-flex-row-wrap-6">
                        <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${u(n.from)}</span>
                        <span style="color:rgba(0,0,0,0.3);">→</span>
                        <span class="stl-heading-3">${u(n.to)}</span>
                    </div>
                    <div style="font-size:1.3rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.01em; margin-top:2px;">${m(n.amount,`EUR`)}${z(n.amount,s)}</div>
                </div>
                ${t?`
                    <button class="btn-primary settle-debt-btn" data-trip-id="${u(e.id)}" data-from="${u(n.from)}" data-to="${u(n.to)}" data-amount="${n.amount}"
                        style="padding: 8px 18px; font-size:0.85rem; border-radius: 999px; flex-shrink:0;">${r(`settlement.settleBtn`)}</button>
                `:``}
            </div>
        `).join(``);return`
        ${g}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:18px; margin-bottom:24px;">
            <div class="card glass stl-card-major">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                    <h3 class="stl-heading-1">${r(`settlement.tripBalancesTitle`)} · ${h}</h3>
                    <span class="stl-section-label">${C(`settlement.peopleCount`,Object.keys(n).length)}</span>
                </div>
                <div class="stl-flex-col-8">
                    ${_}
                </div>
            </div>
            <div class="card glass stl-card-major">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
                    <div style="min-width:0;">
                        <h3 class="stl-heading-1">${r(`settlement.suggestedPaymentsTitle`)} · ${h}</h3>
                        <div style="font-size:0.7rem; font-weight:700; color:var(--text-secondary); margin-top:3px;">${r(`settlement.suggestedPaymentsSubtitle`)}</div>
                    </div>
                    <span class="stl-section-label--shrink-0">${C(`settlement.paymentsCount`,o.length)}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${v}
                </div>
            </div>
        </div>
        ${t?`
            <div style="text-align:center; margin-bottom: 24px;">
                <button class="btn-ghost open-manual-settle-btn" data-trip-id="${u(e.id)}" type="button"
                    style="background: var(--card-bg); border:1px solid var(--border-subtle); color: var(--text-brand-navy); padding: 10px 24px; border-radius: 999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow: 0 4px 12px rgba(0,45,91,0.05);">
                    ${r(`settlement.manualSettleOpenBtn`)}
                </button>
            </div>
        `:``}
    `}function V(e){let t=[];for(let n of _.expenses||[]){if(!(n.tripId===e.id&&n.isSettlement))continue;let r=Object.keys(n.splits||{})[0]||`?`;t.push({id:n.id,source:`expense`,who:n.who||`?`,to:r,euroValue:n.euroValue||0,date:n.date||``})}for(let n of _.settlements||[]){if(n.tripId!==e.id)continue;let r=n.fromName||p(e,n.fromUserId)?.name,i=n.toName||p(e,n.toUserId)?.name;!r||!i||t.push({id:n.id,source:`settlement`,who:r,to:i,euroValue:n.euroValue||n.amount||0,date:(n.createdAt||``).slice(0,10),method:n.method??null,note:n.note??null})}return t.sort((e,t)=>new Date(t.date).getTime()-new Date(e.date).getTime()),t}function H(e,t){let n=V(e);if(n.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">📜</div>
                <h2 style="margin:0 0 6px; color: var(--text-brand-navy);">${r(`settlement.historyEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${r(`settlement.historyEmptyBody`)}</p>
            </div>
        `;let i={};for(let e of n){let t=e.date||`undated`;i[t]||(i[t]=[]),i[t].push(e)}let a=new Date().toISOString().slice(0,10),o=new Date;o.setDate(o.getDate()-1);let s=o.toISOString().slice(0,10),c=e=>{if(e===`undated`)return r(`settlement.historyDateNoDate`);if(e===a)return r(`settlement.historyDateToday`);if(e===s)return r(`settlement.historyDateYesterday`);let t=new Date(e);return isNaN(t.getTime())?e:t.toLocaleDateString(void 0,{weekday:`short`,month:`short`,day:`numeric`,year:`numeric`})},l=Object.keys(i).sort((e,t)=>e===`undated`?1:t===`undated`?-1:t.localeCompare(e));return`
        <div class="card glass stl-card-major">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <h3 class="stl-heading-1">${r(`settlement.historyTitle`)}</h3>
                <span class="stl-section-label">${r(`settlement.historyRecorded`,{count:n.length})}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:18px;">
                ${l.map(n=>{let a=i[n],o=a.reduce((e,t)=>e+(t.euroValue||0),0);return`
                        <div>
                            <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:8px; padding: 0 4px;">
                                <h4 style="margin:0; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary);">${u(c(n))}</h4>
                                <span style="font-size:0.72rem; font-weight:700; color:var(--text-secondary);">${C(`settlement.historyDayTotalPlural`,a.length,{amount:m(o,`EUR`)})}</span>
                            </div>
                            <div class="stl-flex-col-8">
                                ${a.map(n=>{let i=(n.who||`?`).charAt(0).toUpperCase(),a=n.method&&n.source===`settlement`?`<span style="display:inline-flex; align-items:center; gap:3px; background:rgba(0,113,227,0.08); color:var(--accent-blue-deep); padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">${u(n.method.replace(/_/g,` `))}</span>`:``,o=n.note&&n.source===`settlement`?`<div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px; font-style:italic;">"${u(n.note)}"</div>`:``,s=t&&n.source===`expense`?`<button class="edit-settlement-btn" data-settlement-id="${u(n.id)}" type="button"
                                                style="background:rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.22); color: var(--accent-blue-deep); padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${r(`settlement.historyEditBtn`)}</button>`:``,c=t?`<button class="unsettle-settlement-btn" data-settlement-id="${u(n.id)}" data-source="${u(n.source)}" data-trip-id="${u(e.id)}" type="button"
                                                style="background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.22); color:#ff3b30; padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${r(`settlement.historyUnsettleBtn`)}</button>`:``;return`
                                        <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                                            <div style="width:34px; height:34px; border-radius:50%; background:rgba(52,199,89,0.12); color:#1a6b3c; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">${u(i)}</div>
                                            <div class="stl-flex-grow-truncate">
                                                <div class="stl-flex-row-wrap-6">
                                                    <span class="stl-heading-3">${u(n.who)}</span>
                                                    <span style="color:rgba(0,0,0,0.3); font-weight:600;">→</span>
                                                    <span class="stl-heading-3">${u(n.to)}</span>
                                                    <span style="display:inline-flex; align-items:center; gap:3px; background:rgba(52,199,89,0.12); color:#1a6b3c; padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${r(`settlement.historyChipSettled`)}</span>
                                                    ${a}
                                                </div>
                                                ${o}
                                            </div>
                                            <div style="font-size:1rem; font-weight:800; color:#1a6b3c; flex-shrink:0;">${m(n.euroValue||0,`EUR`)}</div>
                                            ${t&&(s||c)?`<div style="display:flex; gap:6px; flex-shrink:0;">${s}${c}</div>`:``}
                                        </div>
                                    `}).join(``)}
                            </div>
                        </div>
                    `}).join(``)}
            </div>
        </div>
    `}function U(){let e=M(),t=Object.entries(e).sort((e,t)=>t[1]-e[1]),n=Math.max(...Object.values(e).map(Math.abs),1),i=t.some(([,e])=>Math.abs(e)>.01);if(t.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">🌍</div>
                <h2 style="margin:0 0 6px; color: var(--text-brand-navy);">${r(`settlement.crossTripEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${r(`settlement.crossTripEmptyBody`)}</p>
            </div>
        `;let a=j(e);return`
        <div class="card glass stl-card-major">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                <h3 class="stl-heading-1">${r(`settlement.crossTripTitle`)}</h3>
                <span class="stl-section-label">${r(`settlement.crossTripSubtitle`)}</span>
            </div>
            <div class="stl-flex-col-8">
                ${t.map(([e,t])=>{let r=i?Math.min(Math.abs(t)/n*100,100):0,a=t>.01,o=t<-.01,s=a?`#1a6b3c`:o?`#a30000`:`var(--text-secondary)`;return`
                        <div style="display:flex; flex-direction:column; gap:10px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                            <div style="display:flex; align-items:center; gap:14px;">
                                <div style="width:34px; height:34px; border-radius:50%; background: ${a?`rgba(52,199,89,0.12)`:o?`rgba(255,59,48,0.1)`:`var(--surface-subtle)`}; color: ${a?`#1a6b3c`:o?`#a30000`:`var(--text-secondary)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                                    ${u(e.charAt(0).toUpperCase())}
                                </div>
                                <div style="flex:1; min-width:0; font-weight:800; color: var(--text-brand-navy); font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${u(e)}</div>
                                <div style="font-weight:800; color: ${s}; font-size:1rem;">
                                    ${a?`+`:``}${m(t,`EUR`)}
                                </div>
                            </div>
                            ${i?`
                                <div style="height:6px; background: rgba(0,0,0,0.05); border-radius:999px; overflow:hidden; position:relative;">
                                    ${a?`<div style="position:absolute; left:50%; top:0; bottom:0; width:${r/2}%; background:#34c759; border-radius:999px;"></div>`:``}
                                    ${o?`<div style="position:absolute; right:50%; top:0; bottom:0; width:${r/2}%; background:#ff3b30; border-radius:999px;"></div>`:``}
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
                        <h3 class="stl-heading-1">Suggested cross-trip payments</h3>
                        <div style="font-size:0.7rem; font-weight:700; color:var(--text-secondary); margin-top:3px;">Fewest payments to clear everyone across every trip you share. Record the actual settlement on whichever trip's tab fits.</div>
                    </div>
                    <span class="stl-section-label--shrink-0">${a.length} ${a.length===1?`payment`:`payments`}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${a.map(e=>`
                        <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:16px;">
                            <div class="stl-flex-grow-truncate">
                                <div class="stl-flex-row-wrap-6">
                                    <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${u(e.from)}</span>
                                    <span style="color:rgba(0,0,0,0.3);">→</span>
                                    <span class="stl-heading-3">${u(e.to)}</span>
                                </div>
                                <div style="font-size:1.3rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.01em; margin-top:2px;">${m(e.amount,`EUR`)}</div>
                            </div>
                        </div>
                    `).join(``)}
                </div>
            </div>
        `:``}
    `}async function W(e,t,n,a,s,l){if(t===n){d(r(`settlement.toastSenderEqualsReceiver`));return}if(!Number.isFinite(a)||a<=0){d(r(`settlement.toastAmountInvalid`));return}if(typeof navigator<`u`&&navigator.onLine===!1){d(r(`errors.offline`));return}let u=c(a,s,`EUR`),p=_.trips.find(t=>t.id===e),h=x(p,t)?.linkedUserId,g=x(p,n)?.linkedUserId;if(h&&g){let o=await i({tripId:e,fromUserId:h,toUserId:g,amount:a,currency:s,euroValue:u,...l?.method?{method:l.method}:{},...l?.note?{note:l.note}:{}});o.settlement?(_.settlements.push(o.settlement),v(f.STATE_CHANGED),d(r(`settlement.toastRecordedNotified`,{amount:m(u,`EUR`),from:t,to:n}))):(console.warn(`[settlement] /api/settlements failed:`,o.error),d(r(`settlement.toastSettlementFailed`,{error:o.error||r(`settlement.toastSettlementFailedNetwork`)})),v(f.STATE_CHANGED));return}let b={id:o(),tripId:e,label:r(`settlement.settlementLabel`,{from:t,to:n}),value:a,euroValue:u,currency:s,who:t,categoryId:_.categories[0]?.id??``,country:r(`settlement.expenseCountry`),date:new Date().toISOString().split(`T`)[0]??``,splits:{[n]:100},isSettlement:!0};_.expenses.push(b),v(f.STATE_CHANGED),y(b),d(r(`settlement.toastRecorded`,{amount:m(u,`EUR`),from:t,to:n}))}async function G(e,t=`expense`){l({title:r(`settlement.toastUnsettleConfirmTitle`),message:r(`settlement.toastUnsettleConfirmMessage`),confirmText:r(`settlement.toastUnsettleConfirmBtn`),onConfirm:async()=>{if(t===`settlement`){let t=await s(e);if(t.error){console.warn(`[settlement] delete failed:`,t.error),d(`Couldn't undo: ${t.error||`Network error`}`);return}_.settlements=_.settlements.filter(t=>t.id!==e),v(f.STATE_CHANGED);return}_.expenses=_.expenses.filter(t=>t.id!==e),v(f.STATE_CHANGED)}})}var K=[{value:`cash`,labelKey:`settlement.methodCash`},{value:`revolut`,labelKey:`settlement.methodRevolut`},{value:`bank_transfer`,labelKey:`settlement.methodBankTransfer`},{value:`wise`,labelKey:`settlement.methodWise`},{value:`paypal`,labelKey:`settlement.methodPayPal`},{value:`custom`,labelKey:`settlement.methodCustom`}];function q(e){let t=_.trips.find(t=>t.id===e),n=h(t).map(e=>`<option value="${u(e)}">${u(e)}</option>`).join(``),i=K.map(e=>`<option value="${u(e.value)}">${u(r(e.labelKey))}</option>`).join(``),o=b(),{root:s,close:c}=w({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${r(`settlement.manualTitle`)}</h2>
            <p class="text-subtitle">${r(`settlement.manualSubtitle`)}</p>
            <form id="manualSettleForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">${u(r(`settlement.labelFrom`))}</label>
                <select id="manualSettleFrom" class="glass-input stl-card-minor-bg">${n}</select>
                <label class="form-label stl-mt-6">${u(r(`settlement.labelTo`))}</label>
                <select id="manualSettleTo" class="glass-input stl-card-minor-bg">${n}</select>
                <label class="form-label stl-mt-6">${u(r(`settlement.labelAmount`,{currency:o}))}</label>
                <input type="number" step="0.01" min="0.01" id="manualSettleAmount" class="glass-input" placeholder="0.00" required class="stl-card-minor">
                <label class="form-label stl-mt-6">${u(r(`settlement.labelMethod`))}</label>
                <select id="manualSettleMethod" class="glass-input stl-card-minor-bg">${i}</select>
                <label class="form-label stl-mt-6">${u(r(`settlement.labelNote`))} <span class="text-subtitle" style="font-weight:500;">${u(r(`settlement.labelNoteOptional`))}</span></label>
                <input type="text" id="manualSettleNote" class="glass-input" maxlength="240" placeholder="${u(r(`settlement.notePlaceholder`))}" class="stl-card-minor">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelManualSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">${u(r(`settlement.cancelBtn`))}</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">${u(r(`settlement.recordPaymentBtn`))}</button>
                </div>
            </form>
        `});a(s,`#cancelManualSettleBtn`).onclick=()=>c(),a(s,`#manualSettleForm`).onsubmit=n=>{n.preventDefault();let i=a(s,`#manualSettleFrom`).value,u=a(s,`#manualSettleTo`).value,f=parseFloat(a(s,`#manualSettleAmount`).value),p=a(s,`#manualSettleMethod`).value,h=a(s,`#manualSettleNote`).value.trim();if(i===u){d(r(`settlement.toastSenderEqualsReceiver`));return}let g=J(t,i,u,o),_=()=>{W(e,i,u,f,o,{method:p,note:h}),c()};if(f>g+.005){l({title:r(`settlement.overpayConfirmTitle`),message:g>.005?r(`settlement.overpayConfirmBody`,{amount:m(f,o),owed:m(g,o),from:i,to:u}):r(`settlement.overpayConfirmBodyNone`,{amount:m(f,o),from:i,to:u}),confirmText:r(`settlement.overpayConfirmBtn`),onConfirm:_});return}_()}}function J(e,t,n,r){if(!e)return 0;let{balances:i}=k(e),a=j(i).find(e=>e.from===t&&e.to===n);return a?c(a.amount,`EUR`,r):0}function Y(e){let t=_.expenses.find(t=>t.id===e);if(!t)return;let n=h(_.trips.find(e=>e.id===t.tripId)),i=n.map(e=>`<option value="${u(e)}" ${t.who===e?`selected`:``}>${u(e)}</option>`).join(``),o=Object.keys(t.splits||{})[0],s=n.map(e=>`<option value="${u(e)}" ${o===e?`selected`:``}>${u(e)}</option>`).join(``),l=b(),{root:p,close:m}=w({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${r(`settlement.editTitle`)}</h2>
            <form id="editSettlementForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">${u(r(`settlement.labelFrom`))}</label>
                <select id="editSettleFrom" class="glass-input stl-card-minor-bg">${i}</select>
                <label class="form-label stl-mt-6">${u(r(`settlement.labelTo`))}</label>
                <select id="editSettleTo" class="glass-input stl-card-minor-bg">${s}</select>
                <label class="form-label stl-mt-6">${u(r(`settlement.labelAmount`,{currency:l}))}</label>
                <input type="number" step="0.01" min="0.01" id="editSettleAmount" value="${c(t.euroValue||0,`EUR`,l).toFixed(2)}" class="glass-input" required class="stl-card-minor">
                <label class="form-label stl-mt-6">${u(r(`settlement.labelDate`))}</label>
                <input type="date" id="editSettleDate" value="${u(t.date||``)}" class="glass-input" required class="stl-card-minor">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelEditSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">${u(r(`settlement.cancelBtn`))}</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">${u(r(`settlement.updateBtn`))}</button>
                </div>
            </form>
        `});a(p,`#cancelEditSettleBtn`).onclick=()=>m(),a(p,`#editSettlementForm`).onsubmit=e=>{e.preventDefault();let n=a(p,`#editSettleFrom`).value,i=a(p,`#editSettleTo`).value,o=parseFloat(a(p,`#editSettleAmount`).value),s=a(p,`#editSettleDate`).value;if(n===i){d(r(`settlement.toastSenderEqualsReceiver`));return}t.who=n,t.splits={[i]:100},t.value=o,t.currency=l,t.euroValue=c(o,l,`EUR`),t.date=s,t.label=r(`settlement.settlementLabel`,{from:n,to:i}),v(f.STATE_CHANGED),y(t),m()}}var X=n();function Z(){let e=T(e=>e.trips),t=T(e=>e.activeTripId),n=T(e=>e.expenses),[i,a]=(0,D.useState)(`trip`),[o,s]=(0,D.useState)(()=>t||(e.length>0?e[0].id:null));(0,D.useEffect)(()=>{t&&t!==o&&s(t)},[t,o]),(0,D.useEffect)(()=>{if(o&&!e.find(e=>e.id===o)){let t=e.length>0?e[0].id:null;s(t),t&&(_.activeTripId=t,v(f.STATE_CHANGED))}},[e,o]);let c=e=>{s(e),_.activeTripId=e,v(f.STATE_CHANGED),i===`global`&&a(`trip`)},{trip:l,canEditExpenses:u}=E(o),d=(0,D.useMemo)(()=>F(l,u,i,o),[l,u,i,o,n]),p=(0,D.useRef)(null),m=e=>{let t=e.target;if(!t)return;let n=t.closest(`.settlement-trip-pill`);if(n?.dataset.tripId){c(n.dataset.tripId);return}let i=t.closest(`.settle-tab`);if(i?.dataset.tab){a(i.dataset.tab);return}let o=t.closest(`.settle-debt-btn`);if(o?.dataset.tripId&&o.dataset.from&&o.dataset.to&&o.dataset.amount&&!o.disabled){o.disabled=!0,o.textContent=r(`settlement.recordingBtn`),W(o.dataset.tripId,o.dataset.from,o.dataset.to,parseFloat(o.dataset.amount),`EUR`);return}let s=t.closest(`.open-manual-settle-btn`);if(s?.dataset.tripId){q(s.dataset.tripId);return}let l=t.closest(`.edit-settlement-btn`);if(l?.dataset.settlementId){Y(l.dataset.settlementId);return}let u=t.closest(`.unsettle-settlement-btn`);if(u?.dataset.settlementId){let e=u.dataset.source===`settlement`?`settlement`:`expense`;G(u.dataset.settlementId,e);return}},h=(0,D.useRef)(c);return h.current=c,(0,D.useEffect)(()=>{let e=p.current;if(!e)return;let t=e=>{let t=e.target;if(t?.id===`settlementTripSelect`){let e=t;e.value&&h.current(e.value)}};return e.addEventListener(`change`,t),()=>e.removeEventListener(`change`,t)},[]),(0,X.jsx)(`div`,{ref:p,onClick:m,dangerouslySetInnerHTML:{__html:d}})}function Q(e){g(e,(0,D.createElement)(Z))}export{Q as mountSettlement};
//# sourceMappingURL=mount-C14dCwQm.js.map