import{i as e}from"./rolldown-runtime-Kw0j5LDr.js";import{r as t,t as n}from"./vendor-react-mHyv4XDd.js";import{Cn as r,Gt as i,L as a,M as o,O as s,Qt as c,S as l,Wt as u,Xt as d,_n as f,bt as p,d as m,en as h,f as g,fn as _,gn as v,in as y,k as b,l as x,on as S,pn as C,pt as w,sn as T,tn as E,u as D,vn as O}from"../app.bundle.js";import{t as k}from"./store-melEiXQF.js";import{n as A}from"./TripContext-BGkBwPMF.js";var j=e(t(),1);function M(e){let t=0,n=0;for(let r of _.expenses||[])r.tripId===e&&r.isSettlement&&(t+=1,n+=r.euroValue||0);for(let r of _.settlements||[])r.tripId===e&&(t+=1,n+=r.euroValue||r.amount||0);return{count:t,eurTotal:n}}function N(e,t,n,r){let i=n===`global`?``:P(r),a=`
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #ffd60a; --g-to: #ff9f0a;">${s(`settlement.title`)}</h1>
            <p>${s(`settlement.subtitle`)}</p>
        </div>
        ${i}
    `;return e?`
        ${a}
        ${F(e,n)}
        ${n===`trip`?R(e,t):``}
        ${n===`history`?B(e,t):``}
        ${n===`global`?V():``}
    `:`
            ${a}
            <div class="card glass" style="text-align: center; padding: 60px 32px; margin-top: 24px; border-radius: 28px;">
                <div style="font-size: 4rem; margin-bottom: 12px;">⚖️</div>
                <h2 style="margin:0 0 6px;">${s(`settlement.noTripsTitle`)}</h2>
                <p class="text-muted">${s(`settlement.noTripsBody`)}</p>
            </div>
        `}function P(e){if(_.trips.length===0)return``;let t=_.trips.find(t=>t.id===e),n=t?M(t.id).eurTotal:0,r=_.trips.map(t=>{let n=M(t.id).eurTotal,r=n>0?` — ${S(n,`EUR`)} ${s(`settlement.settledSuffix`)}`:``;return`<option value="${d(t.id)}"${t.id===e?` selected`:``}>${d(t.name)}${r}</option>`}).join(``);return`
        <div class="settlement-trip-picker" style="margin-top: 18px; margin-bottom: 16px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <label for="settlementTripSelect" style="display:inline-flex; align-items:center; gap:8px; font-size:0.74rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-secondary); flex-shrink:0;">
                <span style="font-size:0.95rem;">⚖️</span>
                ${s(`settlement.tripPickerLabel`)}
            </label>
            <select id="settlementTripSelect" class="settlement-trip-select"
                aria-label="${s(`settlement.tripPickerAriaLabel`)}"
                style="flex:1; min-width:200px; max-width:380px; padding:10px 14px; border-radius:12px; border:1.5px solid rgba(255,159,10,0.4); background:linear-gradient(135deg, rgba(255,214,10,0.08), rgba(255,159,10,0.04)); font-size:0.92rem; font-weight:700; color: var(--text-brand-navy); cursor:pointer; outline:none; font-family:inherit; transition: border-color 0.18s ease, box-shadow 0.18s ease;">
                ${r}
            </select>
            ${t&&n>0?`
                <span style="display:inline-flex; align-items:center; padding:6px 12px; border-radius:999px; background:rgba(0,113,227,0.08); color: var(--accent-blue-deep); font-size:0.78rem; font-weight:800; flex-shrink:0;">
                    ${S(n,`EUR`)} ${s(`settlement.settledSuffix`)}
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
            ${r(`trip`,s(`settlement.tabThisTrip`))}
            ${r(`history`,s(`settlement.tabHistory`),n)}
            ${r(`global`,s(`settlement.tabCrossTrip`))}
        </nav>
    `}function I(e){let t={};for(let n of _.expenses||[]){if(n.tripId!==e||n.isSettlement)continue;let r=(n.currency||`EUR`).toUpperCase();t[r]=(t[r]||0)+(n.euroValue??n.value??0)}let n=null,r=-1;for(let[e,i]of Object.entries(t))i>r&&(r=i,n=e);return n}function L(e,t){return!t||t===T().toUpperCase()?``:`<span style="display:block; font-size:0.72rem; font-weight:600; color:var(--text-secondary); margin-top:1px;">≈ ${d(l(y(Math.abs(e),`EUR`,t),t))}</span>`}function R(e,t){let{balances:n,removedFromRoster:r}=m(e),i=new Set(r||[]),a=g(n),o=I(e.id),c=D(e),l=c.reduce((e,t)=>e+t.paid,0),u=[...c].sort((e,t)=>t.paid-e.paid)[0],f=Object.entries(n).map(([e,t])=>({name:e,net:t})),p=[...f].sort((e,t)=>e.net-t.net)[0],h=[...f].sort((e,t)=>t.net-e.net)[0],_=d(e?.name||`Trip`),v=l>0?`
        <div class="card glass" style="margin-bottom: 18px; padding: 22px 26px; border-radius: 28px; background: linear-gradient(135deg, rgba(255,214,10,0.05), rgba(255,159,10,0.03)); border:1px solid rgba(255,159,10,0.18);">
            <div style="display:flex; flex-wrap:wrap; gap:24px; align-items:center; justify-content:space-between;">
                <div style="min-width:0;">
                    <div style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary); margin-bottom:6px;">${s(`settlement.tripTotal`)} · ${_}</div>
                    <div style="font-size:2rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.02em;">${S(l,`EUR`)}</div>
                </div>
                ${u?`
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${s(`settlement.topPayer`)}</div>
                        <div class="stl-heading-2">${d(u.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:var(--text-secondary);">${S(u.paid,`EUR`)}</div>
                    </div>
                `:``}
                ${h&&h.net>.01?`
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${s(`settlement.topOwed`)}</div>
                        <div class="stl-heading-2">${d(h.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#1a6b3c;">+${S(h.net,`EUR`)}</div>
                    </div>
                `:``}
                ${p&&p.net<-.01?`
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#ff3b30;">${s(`settlement.topOwes`)}</div>
                        <div class="stl-heading-2">${d(p.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#a30000;">${S(p.net,`EUR`)}</div>
                    </div>
                `:``}
            </div>
        </div>
    `:``,y=Object.entries(n).map(([e,t])=>{let n=t>.01,r=t<-.01,a=i.has(e)?`<span style="margin-left:6px; padding:1px 6px; border-radius:6px; background:rgba(0,0,0,0.06); color:var(--text-secondary); font-size:0.7rem; font-weight:700; text-transform:uppercase;">removed</span>`:``;return`
            <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                <div style="width:34px; height:34px; border-radius:50%; background: ${n?`rgba(52,199,89,0.18)`:r?`rgba(255,59,48,0.18)`:`var(--surface-subtle)`}; color: ${n?`#1a6b3c`:r?`#a30000`:`var(--text-secondary)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                    ${d(e.charAt(0).toUpperCase())}
                </div>
                <div style="flex:1; min-width:0; font-weight:800; color: var(--text-brand-navy); font-size:0.95rem; overflow:hidden; text-overflow:ellipsis;">${d(e)}${a}</div>
                <div style="font-weight:800; color: ${n?`#1a6b3c`:r?`#a30000`:`var(--text-secondary)`}; font-size:1rem; text-align:right;">
                    ${n?`+`:``}${S(t,`EUR`)}${L(t,o)}
                </div>
            </div>
        `}).join(``)||`<p class="text-muted" style="padding: 20px; text-align:center;">${s(`settlement.emptyNoCompanions`)}</p>`,x=a.length===0?`<div style="text-align:center; padding: 40px 20px;"><div style="font-size:2.2rem; margin-bottom:8px;">🥂</div><p style="margin:0; font-weight:800; color:#1a6b3c;">${s(`settlement.allSettledTitle`)}</p><p style="margin:6px 0 0; color:var(--text-secondary); font-size:0.85rem;">${s(`settlement.allSettledBody`)}</p></div>`:a.map(n=>`
            <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:16px;">
                <div class="stl-flex-grow-truncate">
                    <div class="stl-flex-row-wrap-6">
                        <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${d(n.from)}</span>
                        <span style="color:rgba(0,0,0,0.3);">→</span>
                        <span class="stl-heading-3">${d(n.to)}</span>
                    </div>
                    <div style="font-size:1.3rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.01em; margin-top:2px;">${S(n.amount,`EUR`)}${L(n.amount,o)}</div>
                </div>
                ${t?`
                    <button class="btn-primary settle-debt-btn" data-trip-id="${d(e.id)}" data-from="${d(n.from)}" data-to="${d(n.to)}" data-amount="${n.amount}"
                        style="padding: 8px 18px; font-size:0.85rem; border-radius: 999px; flex-shrink:0;">${s(`settlement.settleBtn`)}</button>
                `:``}
            </div>
        `).join(``);return`
        ${v}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:18px; margin-bottom:24px;">
            <div class="card glass stl-card-major">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                    <h3 class="stl-heading-1">${s(`settlement.tripBalancesTitle`)} · ${_}</h3>
                    <span class="stl-section-label">${b(`settlement.peopleCount`,Object.keys(n).length)}</span>
                </div>
                <div class="stl-flex-col-8">
                    ${y}
                </div>
            </div>
            <div class="card glass stl-card-major">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
                    <div style="min-width:0;">
                        <h3 class="stl-heading-1">${s(`settlement.suggestedPaymentsTitle`)} · ${_}</h3>
                        <div style="font-size:0.7rem; font-weight:700; color:var(--text-secondary); margin-top:3px;">${s(`settlement.suggestedPaymentsSubtitle`)}</div>
                    </div>
                    <span class="stl-section-label--shrink-0">${b(`settlement.paymentsCount`,a.length)}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${x}
                </div>
            </div>
        </div>
        ${t?`
            <div style="text-align:center; margin-bottom: 24px;">
                <button class="btn-ghost open-manual-settle-btn" data-trip-id="${d(e.id)}" type="button"
                    style="background: var(--card-bg); border:1px solid var(--border-subtle); color: var(--text-brand-navy); padding: 10px 24px; border-radius: 999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow: 0 4px 12px rgba(0,45,91,0.05);">
                    ${s(`settlement.manualSettleOpenBtn`)}
                </button>
            </div>
        `:``}
    `}function z(e){let t=[];for(let n of _.expenses||[]){if(!(n.tripId===e.id&&n.isSettlement))continue;let r=Object.keys(n.splits||{})[0]||`?`;t.push({id:n.id,source:`expense`,who:n.who||`?`,to:r,euroValue:n.euroValue||0,date:n.date||``})}for(let n of _.settlements||[]){if(n.tripId!==e.id)continue;let r=n.fromName||f(e,n.fromUserId)?.name,i=n.toName||f(e,n.toUserId)?.name;!r||!i||t.push({id:n.id,source:`settlement`,who:r,to:i,euroValue:n.euroValue||n.amount||0,date:(n.createdAt||``).slice(0,10),method:n.method??null,note:n.note??null})}return t.sort((e,t)=>new Date(t.date).getTime()-new Date(e.date).getTime()),t}function B(e,t){let n=z(e);if(n.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">📜</div>
                <h2 style="margin:0 0 6px; color: var(--text-brand-navy);">${s(`settlement.historyEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${s(`settlement.historyEmptyBody`)}</p>
            </div>
        `;let r={};for(let e of n){let t=e.date||`undated`;r[t]||(r[t]=[]),r[t].push(e)}let i=new Date().toISOString().slice(0,10),a=new Date;a.setDate(a.getDate()-1);let o=a.toISOString().slice(0,10),c=e=>{if(e===`undated`)return s(`settlement.historyDateNoDate`);if(e===i)return s(`settlement.historyDateToday`);if(e===o)return s(`settlement.historyDateYesterday`);let t=new Date(e);return isNaN(t.getTime())?e:t.toLocaleDateString(void 0,{weekday:`short`,month:`short`,day:`numeric`,year:`numeric`})},l=Object.keys(r).sort((e,t)=>e===`undated`?1:t===`undated`?-1:t.localeCompare(e));return`
        <div class="card glass stl-card-major">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <h3 class="stl-heading-1">${s(`settlement.historyTitle`)}</h3>
                <span class="stl-section-label">${s(`settlement.historyRecorded`,{count:n.length})}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:18px;">
                ${l.map(n=>{let i=r[n],a=i.reduce((e,t)=>e+(t.euroValue||0),0);return`
                        <div>
                            <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:8px; padding: 0 4px;">
                                <h4 style="margin:0; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary);">${d(c(n))}</h4>
                                <span style="font-size:0.72rem; font-weight:700; color:var(--text-secondary);">${b(`settlement.historyDayTotalPlural`,i.length,{amount:S(a,`EUR`)})}</span>
                            </div>
                            <div class="stl-flex-col-8">
                                ${i.map(n=>{let r=(n.who||`?`).charAt(0).toUpperCase(),i=n.method&&n.source===`settlement`?`<span style="display:inline-flex; align-items:center; gap:3px; background:rgba(0,113,227,0.08); color:var(--accent-blue-deep); padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">${d(n.method.replace(/_/g,` `))}</span>`:``,a=n.note&&n.source===`settlement`?`<div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px; font-style:italic;">"${d(n.note)}"</div>`:``,o=t&&n.source===`expense`?`<button class="edit-settlement-btn" data-settlement-id="${d(n.id)}" type="button"
                                                style="background:rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.22); color: var(--accent-blue-deep); padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${s(`settlement.historyEditBtn`)}</button>`:``,c=t?`<button class="unsettle-settlement-btn" data-settlement-id="${d(n.id)}" data-source="${d(n.source)}" data-trip-id="${d(e.id)}" type="button"
                                                style="background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.22); color:#ff3b30; padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${s(`settlement.historyUnsettleBtn`)}</button>`:``;return`
                                        <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                                            <div style="width:34px; height:34px; border-radius:50%; background:rgba(52,199,89,0.12); color:#1a6b3c; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">${d(r)}</div>
                                            <div class="stl-flex-grow-truncate">
                                                <div class="stl-flex-row-wrap-6">
                                                    <span class="stl-heading-3">${d(n.who)}</span>
                                                    <span style="color:rgba(0,0,0,0.3); font-weight:600;">→</span>
                                                    <span class="stl-heading-3">${d(n.to)}</span>
                                                    <span style="display:inline-flex; align-items:center; gap:3px; background:rgba(52,199,89,0.12); color:#1a6b3c; padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${s(`settlement.historyChipSettled`)}</span>
                                                    ${i}
                                                </div>
                                                ${a}
                                            </div>
                                            <div style="font-size:1rem; font-weight:800; color:#1a6b3c; flex-shrink:0;">${S(n.euroValue||0,`EUR`)}</div>
                                            ${t&&(o||c)?`<div style="display:flex; gap:6px; flex-shrink:0;">${o}${c}</div>`:``}
                                        </div>
                                    `}).join(``)}
                            </div>
                        </div>
                    `}).join(``)}
            </div>
        </div>
    `}function V(){let e=x(),t=Object.entries(e).sort((e,t)=>t[1]-e[1]),n=Math.max(...Object.values(e).map(Math.abs),1),r=t.some(([,e])=>Math.abs(e)>.01);if(t.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">🌍</div>
                <h2 style="margin:0 0 6px; color: var(--text-brand-navy);">${s(`settlement.crossTripEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${s(`settlement.crossTripEmptyBody`)}</p>
            </div>
        `;let i=g(e);return`
        <div class="card glass stl-card-major">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                <h3 class="stl-heading-1">${s(`settlement.crossTripTitle`)}</h3>
                <span class="stl-section-label">${s(`settlement.crossTripSubtitle`)}</span>
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
                                    ${a?`+`:``}${S(t,`EUR`)}
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
                                <div style="font-size:1.3rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.01em; margin-top:2px;">${S(e.amount,`EUR`)}</div>
                            </div>
                        </div>
                    `).join(``)}
                </div>
            </div>
        `:``}
    `}var H=new Set;async function U(e,t,n,i,a,l){if(t===n){E(s(`settlement.toastSenderEqualsReceiver`));return}if(!Number.isFinite(i)||i<=0){E(s(`settlement.toastAmountInvalid`));return}if(typeof navigator<`u`&&navigator.onLine===!1){E(s(`errors.offline`));return}let u=y(i,a,`EUR`),d=_.trips.find(t=>t.id===e),f=v(d,t),p=v(d,n),m=`${e}::${t}::${n}::${i}`;if(!H.has(m)){H.add(m);try{if(f&&p){let c=await o({tripId:e,fromUserId:f,toUserId:p,amount:i,currency:a,euroValue:u,...l?.method?{method:l.method}:{},...l?.note?{note:l.note}:{}});c.settlement?(_.settlements=[..._.settlements,c.settlement],C(r.STATE_CHANGED),E(s(`settlement.toastRecordedNotified`,{amount:S(u,`EUR`),from:t,to:n}))):(console.warn(`[settlement] /api/settlements failed:`,c.error),E(s(`settlement.toastSettlementFailed`,{error:c.error||s(`settlement.toastSettlementFailedNetwork`)})),C(r.STATE_CHANGED));return}let d={id:c(),tripId:e,label:s(`settlement.settlementLabel`,{from:t,to:n}),value:i,euroValue:u,currency:a,who:t,categoryId:_.categories[0]?.id??``,country:s(`settlement.expenseCountry`),date:new Date().toISOString().split(`T`)[0]??``,splits:{[n]:100},isSettlement:!0};_.expenses=[..._.expenses,d],C(r.STATE_CHANGED),w(d),E(s(`settlement.toastRecorded`,{amount:S(u,`EUR`),from:t,to:n}))}finally{H.delete(m)}}}async function W(e,t=`expense`){u({title:s(`settlement.toastUnsettleConfirmTitle`),message:s(`settlement.toastUnsettleConfirmMessage`),confirmText:s(`settlement.toastUnsettleConfirmBtn`),onConfirm:async()=>{if(t===`settlement`){let t=await a(e);if(t.error){console.warn(`[settlement] delete failed:`,t.error),E(`Couldn't undo: ${t.error||`Network error`}`);return}_.settlements=_.settlements.filter(t=>t.id!==e),C(r.STATE_CHANGED);return}_.expenses=_.expenses.filter(t=>t.id!==e),C(r.STATE_CHANGED)}})}var G=[{value:`cash`,labelKey:`settlement.methodCash`},{value:`revolut`,labelKey:`settlement.methodRevolut`},{value:`bank_transfer`,labelKey:`settlement.methodBankTransfer`},{value:`wise`,labelKey:`settlement.methodWise`},{value:`paypal`,labelKey:`settlement.methodPayPal`},{value:`custom`,labelKey:`settlement.methodCustom`}];function K(e){let t=_.trips.find(t=>t.id===e),n=O(t).map(e=>`<option value="${d(e)}">${d(e)}</option>`).join(``),r=G.map(e=>`<option value="${d(e.value)}">${d(s(e.labelKey))}</option>`).join(``),a=T(),{root:o,close:c}=i({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${s(`settlement.manualTitle`)}</h2>
            <p class="text-subtitle">${s(`settlement.manualSubtitle`)}</p>
            <form id="manualSettleForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">${d(s(`settlement.labelFrom`))}</label>
                <select id="manualSettleFrom" class="glass-input stl-card-minor-bg">${n}</select>
                <label class="form-label stl-mt-6">${d(s(`settlement.labelTo`))}</label>
                <select id="manualSettleTo" class="glass-input stl-card-minor-bg">${n}</select>
                <label class="form-label stl-mt-6">${d(s(`settlement.labelAmount`,{currency:a}))}</label>
                <input type="number" step="0.01" min="0.01" id="manualSettleAmount" class="glass-input" placeholder="0.00" required class="stl-card-minor">
                <label class="form-label stl-mt-6">${d(s(`settlement.labelMethod`))}</label>
                <select id="manualSettleMethod" class="glass-input stl-card-minor-bg">${r}</select>
                <label class="form-label stl-mt-6">${d(s(`settlement.labelNote`))} <span class="text-subtitle" style="font-weight:500;">${d(s(`settlement.labelNoteOptional`))}</span></label>
                <input type="text" id="manualSettleNote" class="glass-input" maxlength="240" placeholder="${d(s(`settlement.notePlaceholder`))}" class="stl-card-minor">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelManualSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">${d(s(`settlement.cancelBtn`))}</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">${d(s(`settlement.recordPaymentBtn`))}</button>
                </div>
            </form>
        `});h(o,`#cancelManualSettleBtn`).onclick=()=>c(),h(o,`#manualSettleForm`).onsubmit=n=>{n.preventDefault();let r=h(o,`#manualSettleFrom`).value,i=h(o,`#manualSettleTo`).value,l=parseFloat(h(o,`#manualSettleAmount`).value),d=h(o,`#manualSettleMethod`).value,f=h(o,`#manualSettleNote`).value.trim();if(r===i){E(s(`settlement.toastSenderEqualsReceiver`));return}let p=q(t,r,i,a),m=()=>{U(e,r,i,l,a,{method:d,note:f}),c()};if(l>p+.005){u({title:s(`settlement.overpayConfirmTitle`),message:p>.005?s(`settlement.overpayConfirmBody`,{amount:S(l,a),owed:S(p,a),from:r,to:i}):s(`settlement.overpayConfirmBodyNone`,{amount:S(l,a),from:r,to:i}),confirmText:s(`settlement.overpayConfirmBtn`),onConfirm:m});return}m()}}function q(e,t,n,r){if(!e)return 0;let{balances:i}=m(e),a=g(i).find(e=>e.from===t&&e.to===n);return a?y(a.amount,`EUR`,r):0}function J(e){let t=_.expenses.find(t=>t.id===e);if(!t)return;let n=O(_.trips.find(e=>e.id===t.tripId)),a=n.map(e=>`<option value="${d(e)}" ${t.who===e?`selected`:``}>${d(e)}</option>`).join(``),o=Object.keys(t.splits||{})[0],c=n.map(e=>`<option value="${d(e)}" ${o===e?`selected`:``}>${d(e)}</option>`).join(``),l=T(),{root:u,close:f}=i({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${s(`settlement.editTitle`)}</h2>
            <form id="editSettlementForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">${d(s(`settlement.labelFrom`))}</label>
                <select id="editSettleFrom" class="glass-input stl-card-minor-bg">${a}</select>
                <label class="form-label stl-mt-6">${d(s(`settlement.labelTo`))}</label>
                <select id="editSettleTo" class="glass-input stl-card-minor-bg">${c}</select>
                <label class="form-label stl-mt-6">${d(s(`settlement.labelAmount`,{currency:l}))}</label>
                <input type="number" step="0.01" min="0.01" id="editSettleAmount" value="${y(t.euroValue||0,`EUR`,l).toFixed(2)}" class="glass-input" required class="stl-card-minor">
                <label class="form-label stl-mt-6">${d(s(`settlement.labelDate`))}</label>
                <input type="date" id="editSettleDate" value="${d(t.date||``)}" class="glass-input" required class="stl-card-minor">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelEditSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">${d(s(`settlement.cancelBtn`))}</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">${d(s(`settlement.updateBtn`))}</button>
                </div>
            </form>
        `});h(u,`#cancelEditSettleBtn`).onclick=()=>f(),h(u,`#editSettlementForm`).onsubmit=e=>{e.preventDefault();let n=h(u,`#editSettleFrom`).value,i=h(u,`#editSettleTo`).value,a=parseFloat(h(u,`#editSettleAmount`).value),o=h(u,`#editSettleDate`).value;if(n===i){E(s(`settlement.toastSenderEqualsReceiver`));return}t.who=n,t.splits={[i]:100},t.value=a,t.currency=l,t.euroValue=y(a,l,`EUR`),t.date=o,t.label=s(`settlement.settlementLabel`,{from:n,to:i}),C(r.STATE_CHANGED),w(t),f()}}var Y=n();function X(){let e=k(e=>e.trips),t=k(e=>e.activeTripId),n=k(e=>e.expenses),i=k(e=>e.settlements),[a,o]=(0,j.useState)(`trip`),[c,l]=(0,j.useState)(()=>t||(e.length>0?e[0].id:null));(0,j.useEffect)(()=>{t&&t!==c&&l(t)},[t,c]),(0,j.useEffect)(()=>{if(c&&!e.find(e=>e.id===c)){let t=e.length>0?e[0].id:null;l(t),t&&(_.activeTripId=t,C(r.STATE_CHANGED))}},[e,c]);let u=e=>{l(e),_.activeTripId=e,C(r.STATE_CHANGED),a===`global`&&o(`trip`)},{trip:d,canEditExpenses:f}=A(c),p=(0,j.useMemo)(()=>N(d,f,a,c),[d,f,a,c,n,i]),m=(0,j.useRef)(null),h=e=>{let t=e.target;if(!t)return;let n=t.closest(`.settlement-trip-pill`);if(n?.dataset.tripId){u(n.dataset.tripId);return}let r=t.closest(`.settle-tab`);if(r?.dataset.tab){o(r.dataset.tab);return}let i=t.closest(`.settle-debt-btn`);if(i?.dataset.tripId&&i.dataset.from&&i.dataset.to&&i.dataset.amount&&!i.disabled){i.disabled=!0,i.textContent=s(`settlement.recordingBtn`),U(i.dataset.tripId,i.dataset.from,i.dataset.to,parseFloat(i.dataset.amount),`EUR`);return}let a=t.closest(`.open-manual-settle-btn`);if(a?.dataset.tripId){K(a.dataset.tripId);return}let c=t.closest(`.edit-settlement-btn`);if(c?.dataset.settlementId){J(c.dataset.settlementId);return}let l=t.closest(`.unsettle-settlement-btn`);if(l?.dataset.settlementId){let e=l.dataset.source===`settlement`?`settlement`:`expense`;W(l.dataset.settlementId,e);return}},g=(0,j.useRef)(u);return g.current=u,(0,j.useEffect)(()=>{let e=m.current;if(!e)return;let t=e=>{let t=e.target;if(t?.id===`settlementTripSelect`){let e=t;e.value&&g.current(e.value)}};return e.addEventListener(`change`,t),()=>e.removeEventListener(`change`,t)},[]),(0,Y.jsx)(`div`,{ref:m,onClick:h,dangerouslySetInnerHTML:{__html:p}})}function Z(e){p(e,(0,j.createElement)(X))}export{Z as mountSettlement};
//# sourceMappingURL=mount-Bzr9ILyO.js.map