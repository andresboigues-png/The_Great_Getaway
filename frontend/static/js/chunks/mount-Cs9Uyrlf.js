import{i as e}from"./rolldown-runtime-Kw0j5LDr.js";import{r as t,t as n}from"./vendor-react-mHyv4XDd.js";import{Gt as r,L as i,M as a,O as o,Qt as s,S as c,Tn as l,Wt as u,Xt as d,bn as f,bt as p,cn as m,d as h,en as g,f as _,hn as v,k as y,l as b,ln as x,mn as S,on as C,pt as w,tn as T,u as E,vn as D,yn as O}from"../app.bundle.js";import{t as k}from"./store-G2VZIqFu.js";import{n as A}from"./TripContext-B5bPbSW-.js";var j=e(t(),1);function M(e){let t=0,n=0;for(let r of S.expenses||[])r.tripId===e&&r.isSettlement&&(t+=1,n+=r.euroValue||0);for(let r of S.settlements||[])r.tripId===e&&(t+=1,n+=r.euroValue||r.amount||0);return{count:t,eurTotal:n}}function N(e,t,n,r){let i=n===`global`?``:P(r),a=`
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #ffd60a; --g-to: #ff9f0a;">${o(`settlement.title`)}</h1>
            <p>${o(`settlement.subtitle`)}</p>
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
                <h2 style="margin:0 0 6px;">${o(`settlement.noTripsTitle`)}</h2>
                <p class="text-muted">${o(`settlement.noTripsBody`)}</p>
            </div>
        `}function P(e){if(S.trips.length===0)return``;let t=S.trips.find(t=>t.id===e),n=t?M(t.id).eurTotal:0,r=S.trips.map(t=>{let n=M(t.id).eurTotal,r=n>0?` — ${m(n,`EUR`)} ${o(`settlement.settledSuffix`)}`:``;return`<option value="${d(t.id)}"${t.id===e?` selected`:``}>${d(t.name)}${r}</option>`}).join(``);return`
        <div class="settlement-trip-picker" style="margin-top: 18px; margin-bottom: 16px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <label for="settlementTripSelect" style="display:inline-flex; align-items:center; gap:8px; font-size:0.74rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-secondary); flex-shrink:0;">
                <span style="font-size:0.95rem;">⚖️</span>
                ${o(`settlement.tripPickerLabel`)}
            </label>
            <select id="settlementTripSelect" class="settlement-trip-select"
                aria-label="${o(`settlement.tripPickerAriaLabel`)}"
                style="flex:1; min-width:200px; max-width:380px; padding:10px 14px; border-radius:12px; border:1.5px solid rgba(255,159,10,0.4); background:linear-gradient(135deg, rgba(255,214,10,0.08), rgba(255,159,10,0.04)); font-size:0.92rem; font-weight:700; color: var(--text-brand-navy); cursor:pointer; outline:none; font-family:inherit; transition: border-color 0.18s ease, box-shadow 0.18s ease;">
                ${r}
            </select>
            ${t&&n>0?`
                <span style="display:inline-flex; align-items:center; padding:6px 12px; border-radius:999px; background:rgba(0,113,227,0.08); color: var(--accent-blue-deep); font-size:0.78rem; font-weight:800; flex-shrink:0;">
                    ${m(n,`EUR`)} ${o(`settlement.settledSuffix`)}
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
            ${r(`trip`,o(`settlement.tabThisTrip`))}
            ${r(`history`,o(`settlement.tabHistory`),n)}
            ${r(`global`,o(`settlement.tabCrossTrip`))}
        </nav>
    `}function I(e){let t={};for(let n of S.expenses||[]){if(n.tripId!==e||n.isSettlement)continue;let r=(n.currency||`EUR`).toUpperCase();t[r]=(t[r]||0)+(n.euroValue??n.value??0)}let n=null,r=-1;for(let[e,i]of Object.entries(t))i>r&&(r=i,n=e);return n}function L(e,t){return!t||t===x().toUpperCase()?``:`<span style="display:block; font-size:0.72rem; font-weight:600; color:var(--text-secondary); margin-top:1px;">≈ ${d(c(C(Math.abs(e),`EUR`,t),t))}</span>`}function R(e,t){let{balances:n,removedFromRoster:r}=h(e),i=new Set(r||[]),a=_(n),s=I(e.id),c=E(e),l=c.reduce((e,t)=>e+t.paid,0),u=[...c].sort((e,t)=>t.paid-e.paid)[0],f=Object.entries(n).map(([e,t])=>({name:e,net:t})),p=[...f].sort((e,t)=>e.net-t.net)[0],g=[...f].sort((e,t)=>t.net-e.net)[0],v=d(e?.name||`Trip`),b=l>0?`
        <div class="card glass" style="margin-bottom: 18px; padding: 22px 26px; border-radius: 28px; background: linear-gradient(135deg, rgba(255,214,10,0.05), rgba(255,159,10,0.03)); border:1px solid rgba(255,159,10,0.18);">
            <div style="display:flex; flex-wrap:wrap; gap:24px; align-items:center; justify-content:space-between;">
                <div style="min-width:0;">
                    <div style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary); margin-bottom:6px;">${o(`settlement.tripTotal`)} · ${v}</div>
                    <div style="font-size:2rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.02em;">${m(l,`EUR`)}</div>
                </div>
                ${u?`
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${o(`settlement.topPayer`)}</div>
                        <div class="stl-heading-2">${d(u.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:var(--text-secondary);">${m(u.paid,`EUR`)}</div>
                    </div>
                `:``}
                ${g&&g.net>.01?`
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${o(`settlement.topOwed`)}</div>
                        <div class="stl-heading-2">${d(g.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#1a6b3c;">+${m(g.net,`EUR`)}</div>
                    </div>
                `:``}
                ${p&&p.net<-.01?`
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#ff3b30;">${o(`settlement.topOwes`)}</div>
                        <div class="stl-heading-2">${d(p.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#a30000;">${m(p.net,`EUR`)}</div>
                    </div>
                `:``}
            </div>
        </div>
    `:``,x=Object.entries(n).map(([e,t])=>{let n=t>.01,r=t<-.01,a=i.has(e)?`<span style="margin-left:6px; padding:1px 6px; border-radius:6px; background:rgba(0,0,0,0.06); color:var(--text-secondary); font-size:0.7rem; font-weight:700; text-transform:uppercase;">removed</span>`:``;return`
            <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                <div style="width:34px; height:34px; border-radius:50%; background: ${n?`rgba(52,199,89,0.18)`:r?`rgba(255,59,48,0.18)`:`var(--surface-subtle)`}; color: ${n?`#1a6b3c`:r?`#a30000`:`var(--text-secondary)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                    ${d(e.charAt(0).toUpperCase())}
                </div>
                <div style="flex:1; min-width:0; font-weight:800; color: var(--text-brand-navy); font-size:0.95rem; overflow:hidden; text-overflow:ellipsis;">${d(e)}${a}</div>
                <div style="font-weight:800; color: ${n?`#1a6b3c`:r?`#a30000`:`var(--text-secondary)`}; font-size:1rem; text-align:right;">
                    ${n?`+`:``}${m(t,`EUR`)}${L(t,s)}
                </div>
            </div>
        `}).join(``)||`<p class="text-muted" style="padding: 20px; text-align:center;">${o(`settlement.emptyNoCompanions`)}</p>`,S=a.length===0?`<div style="text-align:center; padding: 40px 20px;"><div style="font-size:2.2rem; margin-bottom:8px;">🥂</div><p style="margin:0; font-weight:800; color:#1a6b3c;">${o(`settlement.allSettledTitle`)}</p><p style="margin:6px 0 0; color:var(--text-secondary); font-size:0.85rem;">${o(`settlement.allSettledBody`)}</p></div>`:a.map(n=>`
            <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:16px;">
                <div class="stl-flex-grow-truncate">
                    <div class="stl-flex-row-wrap-6">
                        <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${d(n.from)}</span>
                        <span style="color:rgba(0,0,0,0.3);">→</span>
                        <span class="stl-heading-3">${d(n.to)}</span>
                    </div>
                    <div style="font-size:1.3rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.01em; margin-top:2px;">${m(n.amount,`EUR`)}${L(n.amount,s)}</div>
                </div>
                ${t?`
                    <button class="btn-primary settle-debt-btn" data-trip-id="${d(e.id)}" data-from="${d(n.from)}" data-to="${d(n.to)}" data-amount="${n.amount}"
                        style="padding: 8px 18px; font-size:0.85rem; border-radius: 999px; flex-shrink:0;">${o(`settlement.settleBtn`)}</button>
                `:``}
            </div>
        `).join(``);return`
        ${b}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:18px; margin-bottom:24px;">
            <div class="card glass stl-card-major">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                    <h3 class="stl-heading-1">${o(`settlement.tripBalancesTitle`)} · ${v}</h3>
                    <span class="stl-section-label">${y(`settlement.peopleCount`,Object.keys(n).length)}</span>
                </div>
                <div class="stl-flex-col-8">
                    ${x}
                </div>
            </div>
            <div class="card glass stl-card-major">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
                    <div style="min-width:0;">
                        <h3 class="stl-heading-1">${o(`settlement.suggestedPaymentsTitle`)} · ${v}</h3>
                        <div style="font-size:0.7rem; font-weight:700; color:var(--text-secondary); margin-top:3px;">${o(`settlement.suggestedPaymentsSubtitle`)}</div>
                    </div>
                    <span class="stl-section-label--shrink-0">${y(`settlement.paymentsCount`,a.length)}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${S}
                </div>
            </div>
        </div>
        ${t?`
            <div style="text-align:center; margin-bottom: 24px;">
                <button class="btn-ghost open-manual-settle-btn" data-trip-id="${d(e.id)}" type="button"
                    style="background: var(--card-bg); border:1px solid var(--border-subtle); color: var(--text-brand-navy); padding: 10px 24px; border-radius: 999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow: 0 4px 12px rgba(0,45,91,0.05);">
                    ${o(`settlement.manualSettleOpenBtn`)}
                </button>
            </div>
        `:``}
    `}function z(e){let t=[];for(let n of S.expenses||[]){if(!(n.tripId===e.id&&n.isSettlement))continue;let r=Object.keys(n.splits||{})[0]||`?`;t.push({id:n.id,source:`expense`,who:n.who||`?`,to:r,euroValue:n.euroValue||0,date:n.date||``})}for(let n of S.settlements||[]){if(n.tripId!==e.id)continue;let r=n.fromName||O(e,n.fromUserId)?.name,i=n.toName||O(e,n.toUserId)?.name;!r||!i||t.push({id:n.id,source:`settlement`,who:r,to:i,euroValue:n.euroValue||n.amount||0,date:(n.createdAt||``).slice(0,10),method:n.method??null,note:n.note??null})}return t.sort((e,t)=>new Date(t.date).getTime()-new Date(e.date).getTime()),t}function B(e,t){let n=z(e);if(n.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">📜</div>
                <h2 style="margin:0 0 6px; color: var(--text-brand-navy);">${o(`settlement.historyEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${o(`settlement.historyEmptyBody`)}</p>
            </div>
        `;let r={};for(let e of n){let t=e.date||`undated`;r[t]||(r[t]=[]),r[t].push(e)}let i=new Date().toISOString().slice(0,10),a=new Date;a.setDate(a.getDate()-1);let s=a.toISOString().slice(0,10),c=e=>{if(e===`undated`)return o(`settlement.historyDateNoDate`);if(e===i)return o(`settlement.historyDateToday`);if(e===s)return o(`settlement.historyDateYesterday`);let t=new Date(e);return isNaN(t.getTime())?e:t.toLocaleDateString(void 0,{weekday:`short`,month:`short`,day:`numeric`,year:`numeric`})},l=Object.keys(r).sort((e,t)=>e===`undated`?1:t===`undated`?-1:t.localeCompare(e));return`
        <div class="card glass stl-card-major">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <h3 class="stl-heading-1">${o(`settlement.historyTitle`)}</h3>
                <span class="stl-section-label">${o(`settlement.historyRecorded`,{count:n.length})}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:18px;">
                ${l.map(n=>{let i=r[n],a=i.reduce((e,t)=>e+(t.euroValue||0),0);return`
                        <div>
                            <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:8px; padding: 0 4px;">
                                <h4 style="margin:0; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary);">${d(c(n))}</h4>
                                <span style="font-size:0.72rem; font-weight:700; color:var(--text-secondary);">${y(`settlement.historyDayTotalPlural`,i.length,{amount:m(a,`EUR`)})}</span>
                            </div>
                            <div class="stl-flex-col-8">
                                ${i.map(n=>{let r=(n.who||`?`).charAt(0).toUpperCase(),i=n.method&&n.source===`settlement`?`<span style="display:inline-flex; align-items:center; gap:3px; background:rgba(0,113,227,0.08); color:var(--accent-blue-deep); padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">${d(n.method.replace(/_/g,` `))}</span>`:``,a=n.note&&n.source===`settlement`?`<div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px; font-style:italic;">"${d(n.note)}"</div>`:``,s=t&&n.source===`expense`?`<button class="edit-settlement-btn" data-settlement-id="${d(n.id)}" type="button"
                                                style="background:rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.22); color: var(--accent-blue-deep); padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${o(`settlement.historyEditBtn`)}</button>`:``,c=t?`<button class="unsettle-settlement-btn" data-settlement-id="${d(n.id)}" data-source="${d(n.source)}" data-trip-id="${d(e.id)}" type="button"
                                                style="background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.22); color:#ff3b30; padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${o(`settlement.historyUnsettleBtn`)}</button>`:``;return`
                                        <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                                            <div style="width:34px; height:34px; border-radius:50%; background:rgba(52,199,89,0.12); color:#1a6b3c; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">${d(r)}</div>
                                            <div class="stl-flex-grow-truncate">
                                                <div class="stl-flex-row-wrap-6">
                                                    <span class="stl-heading-3">${d(n.who)}</span>
                                                    <span style="color:rgba(0,0,0,0.3); font-weight:600;">→</span>
                                                    <span class="stl-heading-3">${d(n.to)}</span>
                                                    <span style="display:inline-flex; align-items:center; gap:3px; background:rgba(52,199,89,0.12); color:#1a6b3c; padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${o(`settlement.historyChipSettled`)}</span>
                                                    ${i}
                                                </div>
                                                ${a}
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
    `}function V(){let e=b(),t=Object.entries(e).sort((e,t)=>t[1]-e[1]),n=Math.max(...Object.values(e).map(Math.abs),1),r=t.some(([,e])=>Math.abs(e)>.01);if(t.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">🌍</div>
                <h2 style="margin:0 0 6px; color: var(--text-brand-navy);">${o(`settlement.crossTripEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${o(`settlement.crossTripEmptyBody`)}</p>
            </div>
        `;let i=_(e);return`
        <div class="card glass stl-card-major">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                <h3 class="stl-heading-1">${o(`settlement.crossTripTitle`)}</h3>
                <span class="stl-section-label">${o(`settlement.crossTripSubtitle`)}</span>
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
                                    ${a?`+`:``}${m(t,`EUR`)}
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
                                <div style="font-size:1.3rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.01em; margin-top:2px;">${m(e.amount,`EUR`)}</div>
                            </div>
                        </div>
                    `).join(``)}
                </div>
            </div>
        `:``}
    `}var H=new Set;async function U(e,t,n,r,i,c){if(t===n){T(o(`settlement.toastSenderEqualsReceiver`));return}if(!Number.isFinite(r)||r<=0){T(o(`settlement.toastAmountInvalid`));return}if(typeof navigator<`u`&&navigator.onLine===!1){T(o(`errors.offline`));return}let u=C(r,i,`EUR`),d=S.trips.find(t=>t.id===e),f=D(d,t),p=D(d,n),h=`${e}::${t}::${n}::${r}`;if(!H.has(h)){H.add(h);try{if(f&&p){let s=await a({tripId:e,fromUserId:f,toUserId:p,amount:r,currency:i,euroValue:u,...c?.method?{method:c.method}:{},...c?.note?{note:c.note}:{}});s.settlement?(S.settlements=[...S.settlements,s.settlement],v(l.STATE_CHANGED),T(o(`settlement.toastRecordedNotified`,{amount:m(u,`EUR`),from:t,to:n}))):(console.warn(`[settlement] /api/settlements failed:`,s.error),T(o(`settlement.toastSettlementFailed`,{error:s.error||o(`settlement.toastSettlementFailedNetwork`)})),v(l.STATE_CHANGED));return}let d={id:s(),tripId:e,label:o(`settlement.settlementLabel`,{from:t,to:n}),value:r,euroValue:u,currency:i,who:t,categoryId:S.categories[0]?.id??``,country:o(`settlement.expenseCountry`),date:new Date().toISOString().split(`T`)[0]??``,splits:{[n]:100},isSettlement:!0};S.expenses=[...S.expenses,d],v(l.STATE_CHANGED),w(d),T(o(`settlement.toastRecorded`,{amount:m(u,`EUR`),from:t,to:n}))}finally{H.delete(h)}}}async function W(e,t=`expense`){u({title:o(`settlement.toastUnsettleConfirmTitle`),message:o(`settlement.toastUnsettleConfirmMessage`),confirmText:o(`settlement.toastUnsettleConfirmBtn`),onConfirm:async()=>{if(t===`settlement`){let t=await i(e);if(t.error){console.warn(`[settlement] delete failed:`,t.error),T(`Couldn't undo: ${t.error||`Network error`}`);return}S.settlements=S.settlements.filter(t=>t.id!==e),v(l.STATE_CHANGED);return}S.expenses=S.expenses.filter(t=>t.id!==e),v(l.STATE_CHANGED)}})}var G=[{value:`cash`,labelKey:`settlement.methodCash`},{value:`revolut`,labelKey:`settlement.methodRevolut`},{value:`bank_transfer`,labelKey:`settlement.methodBankTransfer`},{value:`wise`,labelKey:`settlement.methodWise`},{value:`paypal`,labelKey:`settlement.methodPayPal`},{value:`custom`,labelKey:`settlement.methodCustom`}];function K(e){let t=S.trips.find(t=>t.id===e),n=f(t).map(e=>`<option value="${d(e)}">${d(e)}</option>`).join(``),i=G.map(e=>`<option value="${d(e.value)}">${d(o(e.labelKey))}</option>`).join(``),a=x(),{root:s,close:c}=r({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${o(`settlement.manualTitle`)}</h2>
            <p class="text-subtitle">${o(`settlement.manualSubtitle`)}</p>
            <form id="manualSettleForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">${d(o(`settlement.labelFrom`))}</label>
                <select id="manualSettleFrom" class="glass-input stl-card-minor-bg">${n}</select>
                <label class="form-label stl-mt-6">${d(o(`settlement.labelTo`))}</label>
                <select id="manualSettleTo" class="glass-input stl-card-minor-bg">${n}</select>
                <label class="form-label stl-mt-6">${d(o(`settlement.labelAmount`,{currency:a}))}</label>
                <input type="number" step="0.01" min="0.01" id="manualSettleAmount" class="glass-input" placeholder="0.00" required class="stl-card-minor">
                <label class="form-label stl-mt-6">${d(o(`settlement.labelMethod`))}</label>
                <select id="manualSettleMethod" class="glass-input stl-card-minor-bg">${i}</select>
                <label class="form-label stl-mt-6">${d(o(`settlement.labelNote`))} <span class="text-subtitle" style="font-weight:500;">${d(o(`settlement.labelNoteOptional`))}</span></label>
                <input type="text" id="manualSettleNote" class="glass-input" maxlength="240" placeholder="${d(o(`settlement.notePlaceholder`))}" class="stl-card-minor">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelManualSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">${d(o(`settlement.cancelBtn`))}</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">${d(o(`settlement.recordPaymentBtn`))}</button>
                </div>
            </form>
        `});g(s,`#cancelManualSettleBtn`).onclick=()=>c(),g(s,`#manualSettleForm`).onsubmit=n=>{n.preventDefault();let r=g(s,`#manualSettleFrom`).value,i=g(s,`#manualSettleTo`).value,l=parseFloat(g(s,`#manualSettleAmount`).value),d=g(s,`#manualSettleMethod`).value,f=g(s,`#manualSettleNote`).value.trim();if(r===i){T(o(`settlement.toastSenderEqualsReceiver`));return}let p=q(t,r,i,a),h=()=>{U(e,r,i,l,a,{method:d,note:f}),c()};if(l>p+.005){u({title:o(`settlement.overpayConfirmTitle`),message:p>.005?o(`settlement.overpayConfirmBody`,{amount:m(l,a),owed:m(p,a),from:r,to:i}):o(`settlement.overpayConfirmBodyNone`,{amount:m(l,a),from:r,to:i}),confirmText:o(`settlement.overpayConfirmBtn`),onConfirm:h});return}h()}}function q(e,t,n,r){if(!e)return 0;let{balances:i}=h(e),a=_(i).find(e=>e.from===t&&e.to===n);return a?C(a.amount,`EUR`,r):0}function J(e){let t=S.expenses.find(t=>t.id===e);if(!t)return;let n=f(S.trips.find(e=>e.id===t.tripId)),i=n.map(e=>`<option value="${d(e)}" ${t.who===e?`selected`:``}>${d(e)}</option>`).join(``),a=Object.keys(t.splits||{})[0],s=n.map(e=>`<option value="${d(e)}" ${a===e?`selected`:``}>${d(e)}</option>`).join(``),c=x(),{root:u,close:p}=r({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${o(`settlement.editTitle`)}</h2>
            <form id="editSettlementForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">${d(o(`settlement.labelFrom`))}</label>
                <select id="editSettleFrom" class="glass-input stl-card-minor-bg">${i}</select>
                <label class="form-label stl-mt-6">${d(o(`settlement.labelTo`))}</label>
                <select id="editSettleTo" class="glass-input stl-card-minor-bg">${s}</select>
                <label class="form-label stl-mt-6">${d(o(`settlement.labelAmount`,{currency:c}))}</label>
                <input type="number" step="0.01" min="0.01" id="editSettleAmount" value="${C(t.euroValue||0,`EUR`,c).toFixed(2)}" class="glass-input" required class="stl-card-minor">
                <label class="form-label stl-mt-6">${d(o(`settlement.labelDate`))}</label>
                <input type="date" id="editSettleDate" value="${d(t.date||``)}" class="glass-input" required class="stl-card-minor">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelEditSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">${d(o(`settlement.cancelBtn`))}</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">${d(o(`settlement.updateBtn`))}</button>
                </div>
            </form>
        `});g(u,`#cancelEditSettleBtn`).onclick=()=>p(),g(u,`#editSettlementForm`).onsubmit=e=>{e.preventDefault();let n=g(u,`#editSettleFrom`).value,r=g(u,`#editSettleTo`).value,i=parseFloat(g(u,`#editSettleAmount`).value),a=g(u,`#editSettleDate`).value;if(n===r){T(o(`settlement.toastSenderEqualsReceiver`));return}t.who=n,t.splits={[r]:100},t.value=i,t.currency=c,t.euroValue=C(i,c,`EUR`),t.date=a,t.label=o(`settlement.settlementLabel`,{from:n,to:r}),v(l.STATE_CHANGED),w(t),p()}}var Y=n();function X(){let e=k(e=>e.trips),t=k(e=>e.activeTripId),n=k(e=>e.expenses),r=k(e=>e.settlements),[i,a]=(0,j.useState)(`trip`),[s,c]=(0,j.useState)(()=>t||(e.length>0?e[0].id:null));(0,j.useEffect)(()=>{t&&t!==s&&c(t)},[t,s]),(0,j.useEffect)(()=>{if(s&&!e.find(e=>e.id===s)){let t=e.length>0?e[0].id:null;c(t),t&&(S.activeTripId=t,v(l.STATE_CHANGED))}},[e,s]);let u=e=>{c(e),S.activeTripId=e,v(l.STATE_CHANGED),i===`global`&&a(`trip`)},{trip:d,canEditExpenses:f}=A(s),p=(0,j.useMemo)(()=>N(d,f,i,s),[d,f,i,s,n,r]),m=(0,j.useRef)(null),h=e=>{let t=e.target;if(!t)return;let n=t.closest(`.settlement-trip-pill`);if(n?.dataset.tripId){u(n.dataset.tripId);return}let r=t.closest(`.settle-tab`);if(r?.dataset.tab){a(r.dataset.tab);return}let i=t.closest(`.settle-debt-btn`);if(i?.dataset.tripId&&i.dataset.from&&i.dataset.to&&i.dataset.amount&&!i.disabled){i.disabled=!0,i.textContent=o(`settlement.recordingBtn`),U(i.dataset.tripId,i.dataset.from,i.dataset.to,parseFloat(i.dataset.amount),`EUR`);return}let s=t.closest(`.open-manual-settle-btn`);if(s?.dataset.tripId){K(s.dataset.tripId);return}let c=t.closest(`.edit-settlement-btn`);if(c?.dataset.settlementId){J(c.dataset.settlementId);return}let l=t.closest(`.unsettle-settlement-btn`);if(l?.dataset.settlementId){let e=l.dataset.source===`settlement`?`settlement`:`expense`;W(l.dataset.settlementId,e);return}},g=(0,j.useRef)(u);return g.current=u,(0,j.useEffect)(()=>{let e=m.current;if(!e)return;let t=e=>{let t=e.target;if(t?.id===`settlementTripSelect`){let e=t;e.value&&g.current(e.value)}};return e.addEventListener(`change`,t),()=>e.removeEventListener(`change`,t)},[]),(0,Y.jsx)(`div`,{ref:m,onClick:h,dangerouslySetInnerHTML:{__html:p}})}function Z(e){p(e,(0,j.createElement)(X))}export{Z as mountSettlement};
//# sourceMappingURL=mount-Cs9Uyrlf.js.map