import{i as e}from"./rolldown-runtime-Kw0j5LDr.js";import{r as t,t as n}from"./vendor-react-mHyv4XDd.js";import{$t as r,A as i,C as a,En as o,Gt as s,Kt as c,N as l,R as u,Zt as d,bn as f,d as p,f as m,fn as h,gn as g,hn as _,k as v,l as y,ln as b,mt as x,nn as S,p as C,sn as w,tn as T,u as E,un as D,xn as O,xt as k,yn as A}from"../app.bundle.js";import{t as j}from"./store-BlFt_WN9.js";import{n as M}from"./TripContext-CVd3u4qR.js";var N=e(t(),1);function P(e){let t=0,n=0;for(let r of _.expenses||[])r.tripId===e&&r.isSettlement&&(t+=1,n+=r.euroValue||0);for(let r of _.settlements||[])r.tripId===e&&(t+=1,n+=r.euroValue||r.amount||0);return{count:t,eurTotal:n}}function F(e,t,n,r){let i=n===`global`?``:I(r),a=`
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #ffd60a; --g-to: #ff9f0a;">${v(`settlement.title`)}</h1>
            <p>${v(`settlement.subtitle`)}</p>
        </div>
        ${i}
    `;return e?`
        ${a}
        ${L(e,n)}
        ${n===`trip`?B(e,t):``}
        ${n===`history`?H(e,t):``}
        ${n===`global`?U():``}
    `:`
            ${a}
            <div class="card glass" style="text-align: center; padding: 60px 32px; margin-top: 24px; border-radius: 28px;">
                <div style="font-size: 4rem; margin-bottom: 12px;">⚖️</div>
                <h2 style="margin:0 0 6px;">${v(`settlement.noTripsTitle`)}</h2>
                <p class="text-muted">${v(`settlement.noTripsBody`)}</p>
            </div>
        `}function I(e){if(_.trips.length===0)return``;let t=_.trips.find(t=>t.id===e),n=t?P(t.id).eurTotal:0,r=_.trips.map(t=>{let n=P(t.id).eurTotal,r=n>0?` — ${b(n,`EUR`)} ${v(`settlement.settledSuffix`)}`:``;return`<option value="${d(t.id)}"${t.id===e?` selected`:``}>${d(t.name)}${r}</option>`}).join(``);return`
        <div class="settlement-trip-picker" style="margin-top: 18px; margin-bottom: 16px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <label for="settlementTripSelect" style="display:inline-flex; align-items:center; gap:8px; font-size:0.74rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-secondary); flex-shrink:0;">
                <span style="font-size:0.95rem;">⚖️</span>
                ${v(`settlement.tripPickerLabel`)}
            </label>
            <select id="settlementTripSelect" class="settlement-trip-select"
                aria-label="${v(`settlement.tripPickerAriaLabel`)}"
                style="flex:1; min-width:200px; max-width:380px; padding:10px 14px; border-radius:12px; border:1.5px solid rgba(255,159,10,0.4); background:linear-gradient(135deg, rgba(255,214,10,0.08), rgba(255,159,10,0.04)); font-size:0.92rem; font-weight:700; color: var(--text-brand-navy); cursor:pointer; outline:none; font-family:inherit; transition: border-color 0.18s ease, box-shadow 0.18s ease;">
                ${r}
            </select>
            ${t&&n>0?`
                <span style="display:inline-flex; align-items:center; padding:6px 12px; border-radius:999px; background:rgba(0,113,227,0.08); color: var(--accent-blue-deep); font-size:0.78rem; font-weight:800; flex-shrink:0;">
                    ${b(n,`EUR`)} ${v(`settlement.settledSuffix`)}
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
            ${r(`trip`,v(`settlement.tabThisTrip`))}
            ${r(`history`,v(`settlement.tabHistory`),n)}
            ${r(`global`,v(`settlement.tabCrossTrip`))}
        </nav>
    `}function R(e){let t={};for(let n of _.expenses||[]){if(n.tripId!==e||n.isSettlement)continue;let r=(n.currency||`EUR`).toUpperCase();t[r]=(t[r]||0)+(n.euroValue??n.value??0)}let n=null,r=-1;for(let[e,i]of Object.entries(t))i>r&&(r=i,n=e);return n}function z(e,t){return!t||t===D().toUpperCase()?``:`<span style="display:block; font-size:0.72rem; font-weight:600; color:var(--text-secondary); margin-top:1px;">≈ ${d(a(w(Math.abs(e),`EUR`,t),t))}</span>`}function B(e,t){let{balances:n,removedFromRoster:r}=p(e),o=new Set(r||[]),{byCurrency:s}=m(e),c=[];for(let[e,t]of Object.entries(s))for(let n of C(t))c.push({from:n.from,to:n.to,amount:n.amount,currency:e});c.sort((e,t)=>e.from.localeCompare(t.from)||e.to.localeCompare(t.to)||e.currency.localeCompare(t.currency));let l=R(e.id),u=E(e),f=u.reduce((e,t)=>e+t.paid,0),g=[...u].sort((e,t)=>t.paid-e.paid)[0],_=Object.entries(n).map(([e,t])=>({name:e,net:t})),y=[..._].sort((e,t)=>e.net-t.net)[0],x=[..._].sort((e,t)=>t.net-e.net)[0],S=d(e?.name||`Trip`),T=f>0?`
        <div class="card glass" style="margin-bottom: 18px; padding: 22px 26px; border-radius: 28px; background: linear-gradient(135deg, rgba(255,214,10,0.05), rgba(255,159,10,0.03)); border:1px solid rgba(255,159,10,0.18);">
            <div style="display:flex; flex-wrap:wrap; gap:24px; align-items:center; justify-content:space-between;">
                <div style="min-width:0;">
                    <div style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary); margin-bottom:6px;">${v(`settlement.tripTotal`)} · ${S}</div>
                    <div style="font-size:2rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.02em;">${b(f,`EUR`)}</div>
                </div>
                ${g?`
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${v(`settlement.topPayer`)}</div>
                        <div class="stl-heading-2">${d(g.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:var(--text-secondary);">${b(g.paid,`EUR`)}</div>
                    </div>
                `:``}
                ${x&&x.net>.01?`
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${v(`settlement.topOwed`)}</div>
                        <div class="stl-heading-2">${d(x.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#1a6b3c;">+${b(x.net,`EUR`)}</div>
                    </div>
                `:``}
                ${y&&y.net<-.01?`
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#ff3b30;">${v(`settlement.topOwes`)}</div>
                        <div class="stl-heading-2">${d(y.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#a30000;">${b(y.net,`EUR`)}</div>
                    </div>
                `:``}
            </div>
        </div>
    `:``,D=Object.entries(n).map(([e,t])=>{let n=t>.01,r=t<-.01,i=o.has(e)?`<span style="margin-left:6px; padding:1px 6px; border-radius:6px; background:rgba(0,0,0,0.06); color:var(--text-secondary); font-size:0.7rem; font-weight:700; text-transform:uppercase;">removed</span>`:``;return`
            <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                <div style="width:34px; height:34px; border-radius:50%; background: ${n?`rgba(52,199,89,0.18)`:r?`rgba(255,59,48,0.18)`:`var(--surface-subtle)`}; color: ${n?`#1a6b3c`:r?`#a30000`:`var(--text-secondary)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                    ${d(e.charAt(0).toUpperCase())}
                </div>
                <div style="flex:1; min-width:0; font-weight:800; color: var(--text-brand-navy); font-size:0.95rem; overflow:hidden; text-overflow:ellipsis;">${d(e)}${i}</div>
                <div style="font-weight:800; color: ${n?`#1a6b3c`:r?`#a30000`:`var(--text-secondary)`}; font-size:1rem; text-align:right;">
                    ${n?`+`:``}${b(t,`EUR`)}${z(t,l)}
                </div>
            </div>
        `}).join(``)||`<p class="text-muted" style="padding: 20px; text-align:center;">${v(`settlement.emptyNoCompanions`)}</p>`,O=c.length===0?`<div style="text-align:center; padding: 40px 20px;"><div style="font-size:2.2rem; margin-bottom:8px;">🥂</div><p style="margin:0; font-weight:800; color:#1a6b3c;">${v(`settlement.allSettledTitle`)}</p><p style="margin:6px 0 0; color:var(--text-secondary); font-size:0.85rem;">${v(`settlement.allSettledBody`)}</p></div>`:c.map(n=>{let r=h(n.currency)?` <span style="font-weight:600; color:var(--text-secondary); font-size:0.8rem;">≈ ${d(b(w(n.amount,n.currency,`EUR`),`EUR`))}</span>`:``;return`
            <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:16px;">
                <div class="stl-flex-grow-truncate">
                    <div class="stl-flex-row-wrap-6">
                        <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${d(n.from)}</span>
                        <span style="color:rgba(0,0,0,0.3);">→</span>
                        <span class="stl-heading-3">${d(n.to)}</span>
                    </div>
                    <div style="font-size:1.3rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.01em; margin-top:2px;">${d(a(n.amount,n.currency))}${r}</div>
                </div>
                ${t?`
                    <button class="btn-primary settle-debt-btn" data-trip-id="${d(e.id)}" data-from="${d(n.from)}" data-to="${d(n.to)}" data-amount="${n.amount}" data-currency="${d(n.currency)}"
                        style="padding: 8px 18px; font-size:0.85rem; border-radius: 999px; flex-shrink:0;">${v(`settlement.settleBtn`)}</button>
                `:``}
            </div>
        `}).join(``);return`
        ${T}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:18px; margin-bottom:24px;">
            <div class="card glass stl-card-major">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                    <h3 class="stl-heading-1">${v(`settlement.tripBalancesTitle`)} · ${S}</h3>
                    <span class="stl-section-label">${i(`settlement.peopleCount`,Object.keys(n).length)}</span>
                </div>
                <div class="stl-flex-col-8">
                    ${D}
                </div>
            </div>
            <div class="card glass stl-card-major">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
                    <div style="min-width:0;">
                        <h3 class="stl-heading-1">${v(`settlement.suggestedPaymentsTitle`)} · ${S}</h3>
                        <div style="font-size:0.7rem; font-weight:700; color:var(--text-secondary); margin-top:3px;">${v(`settlement.suggestedPaymentsSubtitle`)}</div>
                    </div>
                    <span class="stl-section-label--shrink-0">${i(`settlement.paymentsCount`,c.length)}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${O}
                </div>
            </div>
        </div>
        ${t?`
            <div style="text-align:center; margin-bottom: 24px;">
                <button class="btn-ghost open-manual-settle-btn" data-trip-id="${d(e.id)}" type="button"
                    style="background: var(--card-bg); border:1px solid var(--border-subtle); color: var(--text-brand-navy); padding: 10px 24px; border-radius: 999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow: 0 4px 12px rgba(0,45,91,0.05);">
                    ${v(`settlement.manualSettleOpenBtn`)}
                </button>
            </div>
        `:``}
    `}function V(e){let t=[];for(let n of _.expenses||[]){if(!(n.tripId===e.id&&n.isSettlement))continue;let r=Object.keys(n.splits||{})[0]||`?`;t.push({id:n.id,source:`expense`,who:n.who||`?`,to:r,euroValue:n.euroValue||0,date:n.date||``})}for(let n of _.settlements||[]){if(n.tripId!==e.id)continue;let r=n.fromName||f(e,n.fromUserId)?.name,i=n.toName||f(e,n.toUserId)?.name;!r||!i||t.push({id:n.id,source:`settlement`,who:r,to:i,euroValue:n.euroValue||n.amount||0,date:(n.createdAt||``).slice(0,10),method:n.method??null,note:n.note??null})}return t.sort((e,t)=>new Date(t.date).getTime()-new Date(e.date).getTime()),t}function H(e,t){let n=V(e);if(n.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">📜</div>
                <h2 style="margin:0 0 6px; color: var(--text-brand-navy);">${v(`settlement.historyEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${v(`settlement.historyEmptyBody`)}</p>
            </div>
        `;let r={};for(let e of n){let t=e.date||`undated`;r[t]||(r[t]=[]),r[t].push(e)}let a=new Date().toISOString().slice(0,10),o=new Date;o.setDate(o.getDate()-1);let s=o.toISOString().slice(0,10),c=e=>{if(e===`undated`)return v(`settlement.historyDateNoDate`);if(e===a)return v(`settlement.historyDateToday`);if(e===s)return v(`settlement.historyDateYesterday`);let t=new Date(e);return isNaN(t.getTime())?e:t.toLocaleDateString(void 0,{weekday:`short`,month:`short`,day:`numeric`,year:`numeric`})},l=Object.keys(r).sort((e,t)=>e===`undated`?1:t===`undated`?-1:t.localeCompare(e));return`
        <div class="card glass stl-card-major">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <h3 class="stl-heading-1">${v(`settlement.historyTitle`)}</h3>
                <span class="stl-section-label">${v(`settlement.historyRecorded`,{count:n.length})}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:18px;">
                ${l.map(n=>{let a=r[n],o=a.reduce((e,t)=>e+(t.euroValue||0),0);return`
                        <div>
                            <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:8px; padding: 0 4px;">
                                <h4 style="margin:0; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary);">${d(c(n))}</h4>
                                <span style="font-size:0.72rem; font-weight:700; color:var(--text-secondary);">${i(`settlement.historyDayTotalPlural`,a.length,{amount:b(o,`EUR`)})}</span>
                            </div>
                            <div class="stl-flex-col-8">
                                ${a.map(n=>{let r=(n.who||`?`).charAt(0).toUpperCase(),i=n.method&&n.source===`settlement`?`<span style="display:inline-flex; align-items:center; gap:3px; background:rgba(0,113,227,0.08); color:var(--accent-blue-deep); padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">${d(n.method.replace(/_/g,` `))}</span>`:``,a=n.note&&n.source===`settlement`?`<div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px; font-style:italic;">"${d(n.note)}"</div>`:``,o=t&&n.source===`expense`?`<button class="edit-settlement-btn" data-settlement-id="${d(n.id)}" type="button"
                                                style="background:rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.22); color: var(--accent-blue-deep); padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${v(`settlement.historyEditBtn`)}</button>`:``,s=t?`<button class="unsettle-settlement-btn" data-settlement-id="${d(n.id)}" data-source="${d(n.source)}" data-trip-id="${d(e.id)}" type="button"
                                                style="background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.22); color:#ff3b30; padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${v(`settlement.historyUnsettleBtn`)}</button>`:``;return`
                                        <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                                            <div style="width:34px; height:34px; border-radius:50%; background:rgba(52,199,89,0.12); color:#1a6b3c; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">${d(r)}</div>
                                            <div class="stl-flex-grow-truncate">
                                                <div class="stl-flex-row-wrap-6">
                                                    <span class="stl-heading-3">${d(n.who)}</span>
                                                    <span style="color:rgba(0,0,0,0.3); font-weight:600;">→</span>
                                                    <span class="stl-heading-3">${d(n.to)}</span>
                                                    <span style="display:inline-flex; align-items:center; gap:3px; background:rgba(52,199,89,0.12); color:#1a6b3c; padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${v(`settlement.historyChipSettled`)}</span>
                                                    ${i}
                                                </div>
                                                ${a}
                                            </div>
                                            <div style="font-size:1rem; font-weight:800; color:#1a6b3c; flex-shrink:0;">${b(n.euroValue||0,`EUR`)}</div>
                                            ${t&&(o||s)?`<div style="display:flex; gap:6px; flex-shrink:0;">${o}${s}</div>`:``}
                                        </div>
                                    `}).join(``)}
                            </div>
                        </div>
                    `}).join(``)}
            </div>
        </div>
    `}function U(){let e=y(),t=Object.entries(e).sort((e,t)=>t[1]-e[1]),n=Math.max(...Object.values(e).map(Math.abs),1),r=t.some(([,e])=>Math.abs(e)>.01);if(t.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">🌍</div>
                <h2 style="margin:0 0 6px; color: var(--text-brand-navy);">${v(`settlement.crossTripEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${v(`settlement.crossTripEmptyBody`)}</p>
            </div>
        `;let i=C(e);return`
        <div class="card glass stl-card-major">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                <h3 class="stl-heading-1">${v(`settlement.crossTripTitle`)}</h3>
                <span class="stl-section-label">${v(`settlement.crossTripSubtitle`)}</span>
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
                                    <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${d(e.from)}</span>
                                    <span style="color:rgba(0,0,0,0.3);">→</span>
                                    <span class="stl-heading-3">${d(e.to)}</span>
                                </div>
                                <div style="font-size:1.3rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.01em; margin-top:2px;">${b(e.amount,`EUR`)}</div>
                            </div>
                        </div>
                    `).join(``)}
                </div>
            </div>
        `:``}
    `}var W=new Set;async function G(e,t,n,i,a,s){if(t===n){S(v(`settlement.toastSenderEqualsReceiver`));return}if(!Number.isFinite(i)||i<=0){S(v(`settlement.toastAmountInvalid`));return}if(typeof navigator<`u`&&navigator.onLine===!1){S(v(`errors.offline`));return}let c=w(i,a,`EUR`),u=_.trips.find(t=>t.id===e),d=A(u,t),f=A(u,n),p=`${e}::${t}::${n}::${i}`;if(!W.has(p)){W.add(p);try{if(d&&f){let r=await l({tripId:e,fromUserId:d,toUserId:f,amount:i,currency:a,euroValue:c,...s?.method?{method:s.method}:{},...s?.note?{note:s.note}:{}});r.settlement?(_.settlements=[..._.settlements,r.settlement],g(o.STATE_CHANGED),S(v(`settlement.toastRecordedNotified`,{amount:b(c,`EUR`),from:t,to:n}))):(console.warn(`[settlement] /api/settlements failed:`,r.error),S(v(`settlement.toastSettlementFailed`,{error:r.error||v(`settlement.toastSettlementFailedNetwork`)})),g(o.STATE_CHANGED));return}let u={id:r(),tripId:e,label:v(`settlement.settlementLabel`,{from:t,to:n}),value:i,euroValue:c,currency:a,who:t,categoryId:_.categories[0]?.id??``,country:v(`settlement.expenseCountry`),date:new Date().toISOString().split(`T`)[0]??``,splits:{[n]:100},isSettlement:!0};_.expenses=[..._.expenses,u],g(o.STATE_CHANGED),x(u),S(v(`settlement.toastRecorded`,{amount:b(c,`EUR`),from:t,to:n}))}finally{W.delete(p)}}}async function K(e,t=`expense`){s({title:v(`settlement.toastUnsettleConfirmTitle`),message:v(`settlement.toastUnsettleConfirmMessage`),confirmText:v(`settlement.toastUnsettleConfirmBtn`),onConfirm:async()=>{if(t===`settlement`){let t=await u(e);if(t.error){console.warn(`[settlement] delete failed:`,t.error),S(`Couldn't undo: ${t.error||`Network error`}`);return}_.settlements=_.settlements.filter(t=>t.id!==e),g(o.STATE_CHANGED);return}_.expenses=_.expenses.filter(t=>t.id!==e),g(o.STATE_CHANGED)}})}var q=[{value:`cash`,labelKey:`settlement.methodCash`},{value:`revolut`,labelKey:`settlement.methodRevolut`},{value:`bank_transfer`,labelKey:`settlement.methodBankTransfer`},{value:`wise`,labelKey:`settlement.methodWise`},{value:`paypal`,labelKey:`settlement.methodPayPal`},{value:`custom`,labelKey:`settlement.methodCustom`}];function J(e){let t=_.trips.find(t=>t.id===e),n=O(t).map(e=>`<option value="${d(e)}">${d(e)}</option>`).join(``),r=q.map(e=>`<option value="${d(e.value)}">${d(v(e.labelKey))}</option>`).join(``),i=D(),o=m(t).byCurrency,l=Object.keys(o),u=(R(t?.id??``)||i).toUpperCase(),f=(l.length>0?l:[i.toUpperCase()]).map(e=>`<option value="${d(e)}" ${e===u?`selected`:``}>${d(e)}</option>`).join(``),{root:p,close:h}=c({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${v(`settlement.manualTitle`)}</h2>
            <p class="text-subtitle">${v(`settlement.manualSubtitle`)}</p>
            <form id="manualSettleForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">${d(v(`settlement.labelFrom`))}</label>
                <select id="manualSettleFrom" class="glass-input stl-card-minor-bg">${n}</select>
                <label class="form-label stl-mt-6">${d(v(`settlement.labelTo`))}</label>
                <select id="manualSettleTo" class="glass-input stl-card-minor-bg">${n}</select>
                <label class="form-label stl-mt-6">${d(v(`settlement.labelAmount`,{currency:u}))}</label>
                <div style="display:flex; gap:8px;">
                    <input type="number" step="0.01" min="0.01" id="manualSettleAmount" class="glass-input stl-card-minor" placeholder="0.00" required style="flex:2;">
                    <select id="manualSettleCurrency" class="glass-input stl-card-minor-bg" style="flex:1;" aria-label="${d(v(`settlement.labelAmount`,{currency:``}))}">${f}</select>
                </div>
                <label class="form-label stl-mt-6">${d(v(`settlement.labelMethod`))}</label>
                <select id="manualSettleMethod" class="glass-input stl-card-minor-bg">${r}</select>
                <label class="form-label stl-mt-6">${d(v(`settlement.labelNote`))} <span class="text-subtitle" style="font-weight:500;">${d(v(`settlement.labelNoteOptional`))}</span></label>
                <input type="text" id="manualSettleNote" class="glass-input" maxlength="240" placeholder="${d(v(`settlement.notePlaceholder`))}" class="stl-card-minor">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelManualSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">${d(v(`settlement.cancelBtn`))}</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">${d(v(`settlement.recordPaymentBtn`))}</button>
                </div>
            </form>
        `});T(p,`#cancelManualSettleBtn`).onclick=()=>h(),T(p,`#manualSettleForm`).onsubmit=n=>{n.preventDefault();let r=T(p,`#manualSettleFrom`).value,o=T(p,`#manualSettleTo`).value,c=parseFloat(T(p,`#manualSettleAmount`).value),l=(T(p,`#manualSettleCurrency`)?.value||i).toUpperCase(),u=T(p,`#manualSettleMethod`).value,d=T(p,`#manualSettleNote`).value.trim();if(r===o){S(v(`settlement.toastSenderEqualsReceiver`));return}let f=Y(t,r,o,l),m=()=>{G(e,r,o,c,l,{method:u,note:d}),h()};if(c>f+.005){s({title:v(`settlement.overpayConfirmTitle`),message:f>.005?v(`settlement.overpayConfirmBody`,{amount:a(c,l),owed:a(f,l),from:r,to:o}):v(`settlement.overpayConfirmBodyNone`,{amount:a(c,l),from:r,to:o}),confirmText:v(`settlement.overpayConfirmBtn`),onConfirm:m});return}m()}}function Y(e,t,n,r){if(!e)return 0;let{byCurrency:i}=m(e),a=i[(r||`EUR`).toUpperCase()];if(!a)return 0;let o=C(a).find(e=>e.from===t&&e.to===n);return o?o.amount:0}function X(e){let t=_.expenses.find(t=>t.id===e);if(!t)return;let n=O(_.trips.find(e=>e.id===t.tripId)),r=n.map(e=>`<option value="${d(e)}" ${t.who===e?`selected`:``}>${d(e)}</option>`).join(``),i=Object.keys(t.splits||{})[0],a=n.map(e=>`<option value="${d(e)}" ${i===e?`selected`:``}>${d(e)}</option>`).join(``),s=D(),{root:l,close:u}=c({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${v(`settlement.editTitle`)}</h2>
            <form id="editSettlementForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">${d(v(`settlement.labelFrom`))}</label>
                <select id="editSettleFrom" class="glass-input stl-card-minor-bg">${r}</select>
                <label class="form-label stl-mt-6">${d(v(`settlement.labelTo`))}</label>
                <select id="editSettleTo" class="glass-input stl-card-minor-bg">${a}</select>
                <label class="form-label stl-mt-6">${d(v(`settlement.labelAmount`,{currency:s}))}</label>
                <input type="number" step="0.01" min="0.01" id="editSettleAmount" value="${w(t.euroValue||0,`EUR`,s).toFixed(2)}" class="glass-input" required class="stl-card-minor">
                <label class="form-label stl-mt-6">${d(v(`settlement.labelDate`))}</label>
                <input type="date" id="editSettleDate" value="${d(t.date||``)}" class="glass-input" required class="stl-card-minor">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelEditSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">${d(v(`settlement.cancelBtn`))}</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">${d(v(`settlement.updateBtn`))}</button>
                </div>
            </form>
        `});T(l,`#cancelEditSettleBtn`).onclick=()=>u(),T(l,`#editSettlementForm`).onsubmit=e=>{e.preventDefault();let n=T(l,`#editSettleFrom`).value,r=T(l,`#editSettleTo`).value,i=parseFloat(T(l,`#editSettleAmount`).value),a=T(l,`#editSettleDate`).value;if(n===r){S(v(`settlement.toastSenderEqualsReceiver`));return}t.who=n,t.splits={[r]:100},t.value=i,t.currency=s,t.euroValue=w(i,s,`EUR`),t.date=a,t.label=v(`settlement.settlementLabel`,{from:n,to:r}),g(o.STATE_CHANGED),x(t),u()}}var Z=n();function Q(){let e=j(e=>e.trips),t=j(e=>e.activeTripId),n=j(e=>e.expenses),r=j(e=>e.settlements),[i,a]=(0,N.useState)(`trip`),[s,c]=(0,N.useState)(()=>t||(e.length>0?e[0].id:null));(0,N.useEffect)(()=>{t&&t!==s&&c(t)},[t,s]),(0,N.useEffect)(()=>{if(s&&!e.find(e=>e.id===s)){let t=e.length>0?e[0].id:null;c(t),t&&(_.activeTripId=t,g(o.STATE_CHANGED))}},[e,s]);let l=e=>{c(e),_.activeTripId=e,g(o.STATE_CHANGED),i===`global`&&a(`trip`)},{trip:u,canEditExpenses:d}=M(s),f=(0,N.useMemo)(()=>F(u,d,i,s),[u,d,i,s,n,r]),p=(0,N.useRef)(null),m=e=>{let t=e.target;if(!t)return;let n=t.closest(`.settlement-trip-pill`);if(n?.dataset.tripId){l(n.dataset.tripId);return}let r=t.closest(`.settle-tab`);if(r?.dataset.tab){a(r.dataset.tab);return}let i=t.closest(`.settle-debt-btn`);if(i?.dataset.tripId&&i.dataset.from&&i.dataset.to&&i.dataset.amount&&!i.disabled){i.disabled=!0,i.textContent=v(`settlement.recordingBtn`),G(i.dataset.tripId,i.dataset.from,i.dataset.to,parseFloat(i.dataset.amount),i.dataset.currency||`EUR`);return}let o=t.closest(`.open-manual-settle-btn`);if(o?.dataset.tripId){J(o.dataset.tripId);return}let s=t.closest(`.edit-settlement-btn`);if(s?.dataset.settlementId){X(s.dataset.settlementId);return}let c=t.closest(`.unsettle-settlement-btn`);if(c?.dataset.settlementId){let e=c.dataset.source===`settlement`?`settlement`:`expense`;K(c.dataset.settlementId,e);return}},h=(0,N.useRef)(l);return h.current=l,(0,N.useEffect)(()=>{let e=p.current;if(!e)return;let t=e=>{let t=e.target;if(t?.id===`settlementTripSelect`){let e=t;e.value&&h.current(e.value)}};return e.addEventListener(`change`,t),()=>e.removeEventListener(`change`,t)},[]),(0,Z.jsx)(`div`,{ref:p,onClick:m,dangerouslySetInnerHTML:{__html:f}})}function $(e){k(e,(0,N.createElement)(Q))}export{$ as mountSettlement};
//# sourceMappingURL=mount-8bBm62Ao.js.map