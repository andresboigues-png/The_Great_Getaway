import{r as e,t}from"./vendor-react-CAxw18f3.js";import{C as n,Ct as r,Dt as i,Gt as a,Ht as o,Kt as s,Nt as c,O as l,Ot as u,Pt as d,Qt as f,St as p,Tt as m,Vt as h,f as g,jt as _,kt as v,qt as y,rt as b,v as x,y as S}from"../app.bundle.js";import{t as C}from"./store-BvGQ80CF.js";var w=e();function T(e,t,n){let r=s(n,t.fromUserId)?.name,i=s(n,t.toUserId)?.name;if(!r||!i||e[r]===void 0||e[i]===void 0)return;let a=t.euroValue||t.amount||0;e[r]+=a,e[i]-=a}function E(e){if(!e)return{balances:{},roster:[],expenses:[]};let t=(h.expenses||[]).filter(t=>t.tripId===e.id),n=y(e),r=n.length>0?n:Array.from(new Set(t.flatMap(e=>[e.who,...Object.keys(e.splits||{})]).filter(Boolean))),i={};r.forEach(e=>i[e]=0);for(let e of t){let t=e.euroValue||e.value||0;if(i[e.who]!==void 0&&(i[e.who]+=t),e.splits&&Object.keys(e.splits).length>0)for(let[n,r]of Object.entries(e.splits))i[n]!==void 0&&(i[n]-=t*(Number(r)/100));else{let e=t/Math.max(r.length,1);r.forEach(t=>{i[t]!==void 0&&(i[t]-=e)})}}let a=(h.settlements||[]).filter(t=>t.tripId===e.id);for(let t of a)T(i,t,e);return{balances:i,roster:r,expenses:t}}function D(e){let t=[],n=[];for(let[r,i]of Object.entries(e))i>.01?t.push({person:r,amount:i}):i<-.01&&n.push({person:r,amount:Math.abs(i)});t.sort((e,t)=>t.amount-e.amount),n.sort((e,t)=>t.amount-e.amount);let r=[],i=0,a=0;for(;i<n.length&&a<t.length;){let e=n[i],o=t[a],s=Math.min(e.amount,o.amount);r.push({from:e.person,to:o.person,amount:s}),e.amount-=s,o.amount-=s,e.amount<.01&&i++,o.amount<.01&&a++}return r}function O(){let e={};for(let t of[...h.trips,...h.archivedTrips||[]])for(let n of y(t))n in e||(e[n]=0);let t=(h.archivedTrips||[]).flatMap(e=>e.expenses||[]),n=[...h.expenses,...t],r={};for(let e of[...h.trips,...h.archivedTrips||[]])r[e.id]=y(e);for(let t of n){let n=t.euroValue||t.value||0;if(e[t.who]!==void 0&&(e[t.who]+=n),t.splits&&Object.keys(t.splits).length>0)for(let[r,i]of Object.entries(t.splits))e[r]!==void 0&&(e[r]-=n*(Number(i)/100));else{let i=r[t.tripId]||[],a=i.length>0?i:Array.from(new Set([t.who,...Object.keys(t.splits||{})].filter(Boolean))),o=n/Math.max(a.length,1);a.forEach(t=>{e[t]!==void 0&&(e[t]-=o)})}}let i=new Map;for(let e of[...h.trips,...h.archivedTrips||[]])i.set(e.id,e);for(let t of h.settlements||[]){let n=i.get(t.tripId);n&&T(e,t,n)}return e}function k(e){if(!e)return[];let t=(h.expenses||[]).filter(t=>t.tripId===e.id),n=y(e),r={};n.forEach(e=>r[e]={paid:0,share:0});for(let e of t){let t=e.euroValue||e.value||0;if(r[e.who]&&(r[e.who].paid+=t),e.splits&&Object.keys(e.splits).length>0)for(let[n,i]of Object.entries(e.splits))r[n]&&(r[n].share+=t*(Number(i)/100));else{let e=t/Math.max(n.length,1);n.forEach(t=>{r[t]&&(r[t].share+=e)})}}return Object.entries(r).map(([e,t])=>({name:e,paid:t.paid,share:t.share,net:t.paid-t.share}))}function A(e){let t=0,n=0;for(let r of h.expenses||[])r.tripId===e&&r.isSettlement&&(t+=1,n+=r.euroValue||0);for(let r of h.settlements||[])r.tripId===e&&(t+=1,n+=r.euroValue||r.amount||0);return{count:t,eurTotal:n}}function j(e,t,n,r){let i=n===`global`?``:M(r),a=`
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #ffd60a; --g-to: #ff9f0a;">${x(`settlement.title`)}</h1>
            <p>${x(`settlement.subtitle`)}</p>
        </div>
        ${i}
    `;return e?`
        ${a}
        ${N(e,n)}
        ${n===`trip`?P(e,t):``}
        ${n===`history`?I(e,t):``}
        ${n===`global`?L():``}
    `:`
            ${a}
            <div class="card glass" style="text-align: center; padding: 60px 32px; margin-top: 24px; border-radius: 28px;">
                <div style="font-size: 4rem; margin-bottom: 12px;">⚖️</div>
                <h2 style="margin:0 0 6px;">${x(`settlement.noTripsTitle`)}</h2>
                <p class="text-muted">${x(`settlement.noTripsBody`)}</p>
            </div>
        `}function M(e){if(h.trips.length===0)return``;let t=h.trips.find(t=>t.id===e),n=t?A(t.id).eurTotal:0,r=h.trips.map(t=>{let n=A(t.id).eurTotal,r=n>0?` — ${c(n,`EUR`)} ${x(`settlement.settledSuffix`)}`:``;return`<option value="${m(t.id)}"${t.id===e?` selected`:``}>${m(t.name)}${r}</option>`}).join(``);return`
        <div class="settlement-trip-picker" style="margin-top: 18px; margin-bottom: 16px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <label for="settlementTripSelect" style="display:inline-flex; align-items:center; gap:8px; font-size:0.74rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-secondary); flex-shrink:0;">
                <span style="font-size:0.95rem;">⚖️</span>
                ${x(`settlement.tripPickerLabel`)}
            </label>
            <select id="settlementTripSelect" class="settlement-trip-select"
                aria-label="${x(`settlement.tripPickerAriaLabel`)}"
                style="flex:1; min-width:200px; max-width:380px; padding:10px 14px; border-radius:12px; border:1.5px solid rgba(255,159,10,0.4); background:linear-gradient(135deg, rgba(255,214,10,0.08), rgba(255,159,10,0.04)); font-size:0.92rem; font-weight:700; color: var(--text-brand-navy); cursor:pointer; outline:none; font-family:inherit; transition: border-color 0.18s ease, box-shadow 0.18s ease;">
                ${r}
            </select>
            ${t&&n>0?`
                <span style="display:inline-flex; align-items:center; padding:6px 12px; border-radius:999px; background:rgba(0,113,227,0.08); color: var(--accent-blue-deep); font-size:0.78rem; font-weight:800; flex-shrink:0;">
                    ${c(n,`EUR`)} ${x(`settlement.settledSuffix`)}
                </span>
            `:``}
        </div>
    `}function N(e,t){let n=A(e.id).count,r=(e,n,r)=>`
        <button class="settle-tab${t===e?` is-active`:``}" data-tab="${e}" type="button"
            style="background:none; border:0; padding:12px 4px; font-size:0.95rem; font-weight:${t===e?`800`:`600`}; color:${t===e?`var(--accent-blue-deep)`:`var(--text-secondary)`}; cursor:pointer; border-bottom:2px solid ${t===e?`var(--accent-blue)`:`transparent`}; margin-bottom:-1px; letter-spacing:-0.01em; transition: color 0.2s, border-color 0.2s;">
            ${n}${r!==void 0&&r>0?` <span style="background:rgba(0,113,227,0.12); color: var(--accent-blue-deep); padding:1px 6px; border-radius:999px; font-size:0.7rem; font-weight:800; margin-left:2px;">${r}</span>`:``}
        </button>
    `;return`
        <nav style="display:flex; gap:36px; border-bottom: 1px solid rgba(0,113,227,0.25); margin: 22px 0 22px; padding: 0 4px;">
            ${r(`trip`,x(`settlement.tabThisTrip`))}
            ${r(`history`,x(`settlement.tabHistory`),n)}
            ${r(`global`,x(`settlement.tabCrossTrip`))}
        </nav>
    `}function P(e,t){let{balances:n}=E(e),r=D(n),i=k(e),a=i.reduce((e,t)=>e+t.paid,0),o=[...i].sort((e,t)=>t.paid-e.paid)[0],s=[...i].sort((e,t)=>e.net-t.net)[0],l=[...i].sort((e,t)=>t.net-e.net)[0],u=m(e?.name||`Trip`),d=a>0?`
        <div class="card glass" style="margin-bottom: 18px; padding: 22px 26px; border-radius: 28px; background: linear-gradient(135deg, rgba(255,214,10,0.05), rgba(255,159,10,0.03)); border:1px solid rgba(255,159,10,0.18);">
            <div style="display:flex; flex-wrap:wrap; gap:24px; align-items:center; justify-content:space-between;">
                <div style="min-width:0;">
                    <div style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary); margin-bottom:6px;">${x(`settlement.tripTotal`)} · ${u}</div>
                    <div style="font-size:2rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.02em;">${c(a,`EUR`)}</div>
                </div>
                ${o?`
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${x(`settlement.topPayer`)}</div>
                        <div style="font-size:1.1rem; font-weight:800; color: var(--text-brand-navy); margin-top:4px;">${m(o.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:var(--text-secondary);">${c(o.paid,`EUR`)}</div>
                    </div>
                `:``}
                ${l&&l.net>.01?`
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${x(`settlement.topOwed`)}</div>
                        <div style="font-size:1.1rem; font-weight:800; color: var(--text-brand-navy); margin-top:4px;">${m(l.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#1a6b3c;">+${c(l.net,`EUR`)}</div>
                    </div>
                `:``}
                ${s&&s.net<-.01?`
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#ff3b30;">${x(`settlement.topOwes`)}</div>
                        <div style="font-size:1.1rem; font-weight:800; color: var(--text-brand-navy); margin-top:4px;">${m(s.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#a30000;">${c(s.net,`EUR`)}</div>
                    </div>
                `:``}
            </div>
        </div>
    `:``,f=Object.entries(n).map(([e,t])=>{let n=t>.01,r=t<-.01;return`
            <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                <div style="width:34px; height:34px; border-radius:50%; background: ${n?`rgba(52,199,89,0.18)`:r?`rgba(255,59,48,0.18)`:`var(--surface-subtle)`}; color: ${n?`#1a6b3c`:r?`#a30000`:`var(--text-secondary)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                    ${m(e.charAt(0).toUpperCase())}
                </div>
                <div style="flex:1; min-width:0; font-weight:800; color: var(--text-brand-navy); font-size:0.95rem; overflow:hidden; text-overflow:ellipsis;">${m(e)}</div>
                <div style="font-weight:800; color: ${n?`#1a6b3c`:r?`#a30000`:`var(--text-secondary)`}; font-size:1rem;">
                    ${n?`+`:``}${c(t,`EUR`)}
                </div>
            </div>
        `}).join(``)||`<p class="text-muted" style="padding: 20px; text-align:center;">${x(`settlement.emptyNoCompanions`)}</p>`,p=r.length===0?`<div style="text-align:center; padding: 40px 20px;"><div style="font-size:2.2rem; margin-bottom:8px;">🥂</div><p style="margin:0; font-weight:800; color:#1a6b3c;">${x(`settlement.allSettledTitle`)}</p><p style="margin:6px 0 0; color:var(--text-secondary); font-size:0.85rem;">${x(`settlement.allSettledBody`)}</p></div>`:r.map(n=>`
            <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:16px;">
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${m(n.from)}</span>
                        <span style="color:rgba(0,0,0,0.3);">→</span>
                        <span style="font-weight:800; color: var(--text-brand-navy); font-size:0.95rem;">${m(n.to)}</span>
                    </div>
                    <div style="font-size:1.3rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.01em; margin-top:2px;">${c(n.amount,`EUR`)}</div>
                </div>
                ${t?`
                    <button class="btn-primary settle-debt-btn" data-trip-id="${m(e.id)}" data-from="${m(n.from)}" data-to="${m(n.to)}" data-amount="${n.amount}"
                        style="padding: 8px 18px; font-size:0.85rem; border-radius: 999px; flex-shrink:0;">${x(`settlement.settleBtn`)}</button>
                `:``}
            </div>
        `).join(``);return`
        ${d}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:18px; margin-bottom:24px;">
            <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                    <h3 style="margin:0; font-size:1.05rem; color: var(--text-brand-navy); font-weight:800; letter-spacing:-0.02em;">${x(`settlement.tripBalancesTitle`)} · ${u}</h3>
                    <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${S(`settlement.peopleCount`,Object.keys(n).length)}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    ${f}
                </div>
            </div>
            <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
                    <div style="min-width:0;">
                        <h3 style="margin:0; font-size:1.05rem; color: var(--text-brand-navy); font-weight:800; letter-spacing:-0.02em;">${x(`settlement.suggestedPaymentsTitle`)} · ${u}</h3>
                        <div style="font-size:0.7rem; font-weight:700; color:var(--text-secondary); margin-top:3px;">${x(`settlement.suggestedPaymentsSubtitle`)}</div>
                    </div>
                    <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em; flex-shrink:0;">${S(`settlement.paymentsCount`,r.length)}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${p}
                </div>
            </div>
        </div>
        ${t?`
            <div style="text-align:center; margin-bottom: 24px;">
                <button class="btn-ghost open-manual-settle-btn" data-trip-id="${m(e.id)}" type="button"
                    style="background: var(--card-bg); border:1px solid var(--border-subtle); color: var(--text-brand-navy); padding: 10px 24px; border-radius: 999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow: 0 4px 12px rgba(0,45,91,0.05);">
                    ${x(`settlement.manualSettleOpenBtn`)}
                </button>
            </div>
        `:``}
    `}function F(e){let t=[];for(let n of h.expenses||[]){if(!(n.tripId===e.id&&n.isSettlement))continue;let r=Object.keys(n.splits||{})[0]||`?`;t.push({id:n.id,source:`expense`,who:n.who||`?`,to:r,euroValue:n.euroValue||0,date:n.date||``})}for(let n of h.settlements||[]){if(n.tripId!==e.id)continue;let r=s(e,n.fromUserId)?.name,i=s(e,n.toUserId)?.name;!r||!i||t.push({id:n.id,source:`settlement`,who:r,to:i,euroValue:n.euroValue||n.amount||0,date:(n.createdAt||``).slice(0,10),method:n.method??null,note:n.note??null})}return t.sort((e,t)=>new Date(t.date).getTime()-new Date(e.date).getTime()),t}function I(e,t){let n=F(e);if(n.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">📜</div>
                <h2 style="margin:0 0 6px; color: var(--text-brand-navy);">${x(`settlement.historyEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${x(`settlement.historyEmptyBody`)}</p>
            </div>
        `;let r={};for(let e of n){let t=e.date||`undated`;r[t]||(r[t]=[]),r[t].push(e)}let i=new Date().toISOString().slice(0,10),a=new Date;a.setDate(a.getDate()-1);let o=a.toISOString().slice(0,10),s=e=>{if(e===`undated`)return x(`settlement.historyDateNoDate`);if(e===i)return x(`settlement.historyDateToday`);if(e===o)return x(`settlement.historyDateYesterday`);let t=new Date(e);return isNaN(t.getTime())?e:t.toLocaleDateString(void 0,{weekday:`short`,month:`short`,day:`numeric`,year:`numeric`})},l=Object.keys(r).sort((e,t)=>e===`undated`?1:t===`undated`?-1:t.localeCompare(e));return`
        <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <h3 style="margin:0; font-size:1.05rem; color: var(--text-brand-navy); font-weight:800; letter-spacing:-0.02em;">${x(`settlement.historyTitle`)}</h3>
                <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${x(`settlement.historyRecorded`,{count:n.length})}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:18px;">
                ${l.map(n=>{let i=r[n],a=i.reduce((e,t)=>e+(t.euroValue||0),0);return`
                        <div>
                            <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:8px; padding: 0 4px;">
                                <h4 style="margin:0; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary);">${m(s(n))}</h4>
                                <span style="font-size:0.72rem; font-weight:700; color:var(--text-secondary);">${S(`settlement.historyDayTotalPlural`,i.length,{amount:c(a,`EUR`)})}</span>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                ${i.map(n=>{let r=(n.who||`?`).charAt(0).toUpperCase(),i=n.method&&n.source===`settlement`?`<span style="display:inline-flex; align-items:center; gap:3px; background:rgba(0,113,227,0.08); color:var(--accent-blue-deep); padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">${m(n.method.replace(/_/g,` `))}</span>`:``,a=n.note&&n.source===`settlement`?`<div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px; font-style:italic;">"${m(n.note)}"</div>`:``,o=t&&n.source===`expense`?`<button class="edit-settlement-btn" data-settlement-id="${m(n.id)}" type="button"
                                                style="background:rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.22); color: var(--accent-blue-deep); padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${x(`settlement.historyEditBtn`)}</button>`:``,s=t?`<button class="unsettle-settlement-btn" data-settlement-id="${m(n.id)}" data-source="${m(n.source)}" data-trip-id="${m(e.id)}" type="button"
                                                style="background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.22); color:#ff3b30; padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${x(`settlement.historyUnsettleBtn`)}</button>`:``;return`
                                        <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                                            <div style="width:34px; height:34px; border-radius:50%; background:rgba(52,199,89,0.12); color:#1a6b3c; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">${m(r)}</div>
                                            <div style="flex:1; min-width:0;">
                                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                                    <span style="font-weight:800; color: var(--text-brand-navy); font-size:0.95rem;">${m(n.who)}</span>
                                                    <span style="color:rgba(0,0,0,0.3); font-weight:600;">→</span>
                                                    <span style="font-weight:800; color: var(--text-brand-navy); font-size:0.95rem;">${m(n.to)}</span>
                                                    <span style="display:inline-flex; align-items:center; gap:3px; background:rgba(52,199,89,0.12); color:#1a6b3c; padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${x(`settlement.historyChipSettled`)}</span>
                                                    ${i}
                                                </div>
                                                ${a}
                                            </div>
                                            <div style="font-size:1rem; font-weight:800; color:#1a6b3c; flex-shrink:0;">${c(n.euroValue||0,`EUR`)}</div>
                                            ${t&&(o||s)?`<div style="display:flex; gap:6px; flex-shrink:0;">${o}${s}</div>`:``}
                                        </div>
                                    `}).join(``)}
                            </div>
                        </div>
                    `}).join(``)}
            </div>
        </div>
    `}function L(){let e=O(),t=Object.entries(e).sort((e,t)=>t[1]-e[1]),n=Math.max(...Object.values(e).map(Math.abs),1),r=t.some(([,e])=>Math.abs(e)>.01);if(t.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">🌍</div>
                <h2 style="margin:0 0 6px; color: var(--text-brand-navy);">${x(`settlement.crossTripEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${x(`settlement.crossTripEmptyBody`)}</p>
            </div>
        `;let i=D(e);return`
        <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                <h3 style="margin:0; font-size:1.05rem; color: var(--text-brand-navy); font-weight:800; letter-spacing:-0.02em;">${x(`settlement.crossTripTitle`)}</h3>
                <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${x(`settlement.crossTripSubtitle`)}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
                ${t.map(([e,t])=>{let i=r?Math.min(Math.abs(t)/n*100,100):0,a=t>.01,o=t<-.01,s=a?`#1a6b3c`:o?`#a30000`:`var(--text-secondary)`;return`
                        <div style="display:flex; flex-direction:column; gap:10px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                            <div style="display:flex; align-items:center; gap:14px;">
                                <div style="width:34px; height:34px; border-radius:50%; background: ${a?`rgba(52,199,89,0.12)`:o?`rgba(255,59,48,0.1)`:`var(--surface-subtle)`}; color: ${a?`#1a6b3c`:o?`#a30000`:`var(--text-secondary)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                                    ${m(e.charAt(0).toUpperCase())}
                                </div>
                                <div style="flex:1; min-width:0; font-weight:800; color: var(--text-brand-navy); font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${m(e)}</div>
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
                                    <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${m(e.from)}</span>
                                    <span style="color:rgba(0,0,0,0.3);">→</span>
                                    <span style="font-weight:800; color: var(--text-brand-navy); font-size:0.95rem;">${m(e.to)}</span>
                                </div>
                                <div style="font-size:1.3rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.01em; margin-top:2px;">${c(e.amount,`EUR`)}</div>
                            </div>
                        </div>
                    `).join(``)}
                </div>
            </div>
        `:``}
    `}async function R(e,t,r,s,l,u){if(t===r){v(x(`settlement.toastSenderEqualsReceiver`));return}if(!Number.isFinite(s)||s<=0){v(x(`settlement.toastAmountInvalid`));return}let d=_(s,l,`EUR`),p=h.trips.find(t=>t.id===e),m=a(p,t)?.linkedUserId,g=a(p,r)?.linkedUserId;if(m&&g){let i=await n({tripId:e,fromUserId:m,toUserId:g,amount:s,currency:l,euroValue:d,...u?.method?{method:u.method}:{},...u?.note?{note:u.note}:{}});i.settlement?(h.settlements.push(i.settlement),o(f.STATE_CHANGED),v(`Recorded ${c(d,`EUR`)} ${t} → ${r} · notified ${r}`)):(console.warn(`[settlement] /api/settlements failed:`,i.error),v(`Settlement failed: ${i.error||`Network error`}`));return}let y={id:i(),tripId:e,label:`Settlement: ${t} → ${r}`,value:s,euroValue:d,currency:l,who:t,categoryId:h.categories[0]?.id??``,country:x(`settlement.expenseCountry`),date:new Date().toISOString().split(`T`)[0]??``,splits:{[r]:100},isSettlement:!0};h.expenses.push(y),o(f.STATE_CHANGED),v(`Recorded ${c(d,`EUR`)} ${t} → ${r}`)}async function z(e,t=`expense`){p({title:x(`settlement.toastUnsettleConfirmTitle`),message:x(`settlement.toastUnsettleConfirmMessage`),confirmText:x(`settlement.toastUnsettleConfirmBtn`),onConfirm:async()=>{if(t===`settlement`){let t=await l(e);if(t.error){console.warn(`[settlement] delete failed:`,t.error),v(`Couldn't undo: ${t.error||`Network error`}`);return}h.settlements=h.settlements.filter(t=>t.id!==e),o(f.STATE_CHANGED);return}h.expenses=h.expenses.filter(t=>t.id!==e),o(f.STATE_CHANGED)}})}var B=[{value:`cash`,label:`Cash`},{value:`revolut`,label:`Revolut`},{value:`bank_transfer`,label:`Bank transfer`},{value:`wise`,label:`Wise`},{value:`paypal`,label:`PayPal`},{value:`custom`,label:`Custom`}];function V(e){let t=y(h.trips.find(t=>t.id===e)).map(e=>`<option value="${m(e)}">${m(e)}</option>`).join(``),n=B.map(e=>`<option value="${m(e.value)}">${m(e.label)}</option>`).join(``),i=d(),{root:a,close:o}=r({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${x(`settlement.manualTitle`)}</h2>
            <p class="text-subtitle">${x(`settlement.manualSubtitle`)}</p>
            <form id="manualSettleForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">From</label>
                <select id="manualSettleFrom" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background: var(--card-bg);">${t}</select>
                <label class="form-label" style="margin-top:6px;">To</label>
                <select id="manualSettleTo" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background: var(--card-bg);">${t}</select>
                <label class="form-label" style="margin-top:6px;">Amount (${m(i)})</label>
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
        `});u(a,`#cancelManualSettleBtn`).onclick=()=>o(),u(a,`#manualSettleForm`).onsubmit=t=>{t.preventDefault();let n=u(a,`#manualSettleFrom`).value,r=u(a,`#manualSettleTo`).value,s=parseFloat(u(a,`#manualSettleAmount`).value),c=u(a,`#manualSettleMethod`).value,l=u(a,`#manualSettleNote`).value.trim();if(n===r){v(x(`settlement.toastSenderEqualsReceiver`));return}R(e,n,r,s,i,{method:c,note:l}),o()}}function H(e){let t=h.expenses.find(t=>t.id===e);if(!t)return;let n=y(h.trips.find(e=>e.id===t.tripId)),i=n.map(e=>`<option value="${m(e)}" ${t.who===e?`selected`:``}>${m(e)}</option>`).join(``),a=Object.keys(t.splits||{})[0],s=n.map(e=>`<option value="${m(e)}" ${a===e?`selected`:``}>${m(e)}</option>`).join(``),c=d(),{root:l,close:p}=r({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${x(`settlement.editTitle`)}</h2>
            <form id="editSettlementForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">From</label>
                <select id="editSettleFrom" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background: var(--card-bg);">${i}</select>
                <label class="form-label" style="margin-top:6px;">To</label>
                <select id="editSettleTo" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background: var(--card-bg);">${s}</select>
                <label class="form-label" style="margin-top:6px;">Amount (${m(c)})</label>
                <input type="number" step="0.01" min="0.01" id="editSettleAmount" value="${_(t.euroValue||0,`EUR`,c).toFixed(2)}" class="glass-input" required style="padding: var(--space-3); border-radius: 12px;">
                <label class="form-label" style="margin-top:6px;">Date</label>
                <input type="date" id="editSettleDate" value="${m(t.date||``)}" class="glass-input" required style="padding: var(--space-3); border-radius: 12px;">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelEditSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">Cancel</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">Update</button>
                </div>
            </form>
        `});u(l,`#cancelEditSettleBtn`).onclick=()=>p(),u(l,`#editSettlementForm`).onsubmit=e=>{e.preventDefault();let n=u(l,`#editSettleFrom`).value,r=u(l,`#editSettleTo`).value,i=parseFloat(u(l,`#editSettleAmount`).value),a=u(l,`#editSettleDate`).value;if(n===r){v(x(`settlement.toastSenderEqualsReceiver`));return}t.who=n,t.splits={[r]:100},t.value=i,t.currency=c,t.euroValue=_(i,c,`EUR`),t.date=a,t.label=`Settlement: ${n} → ${r}`,o(f.STATE_CHANGED),p()}}var U=t();function W(){let e=C(e=>e.trips),t=C(e=>e.activeTripId),n=C(e=>e.expenses),[r,i]=(0,w.useState)(`trip`),[a,s]=(0,w.useState)(()=>t||(e.length>0?e[0].id:null));(0,w.useEffect)(()=>{t&&t!==a&&s(t)},[t,a]),(0,w.useEffect)(()=>{if(a&&!e.find(e=>e.id===a)){let t=e.length>0?e[0].id:null;s(t),t&&(h.activeTripId=t,o(f.STATE_CHANGED))}},[e,a]);let c=e=>{s(e),h.activeTripId=e,o(f.STATE_CHANGED),r===`global`&&i(`trip`)},l=e.find(e=>e.id===a)||null,u=g(l),d=(0,w.useMemo)(()=>j(l,u,r,a),[l,u,r,a,n]),p=(0,w.useRef)(null),m=e=>{let t=e.target;if(!t)return;let n=t.closest(`.settlement-trip-pill`);if(n?.dataset.tripId){c(n.dataset.tripId);return}let r=t.closest(`.settle-tab`);if(r?.dataset.tab){i(r.dataset.tab);return}let a=t.closest(`.settle-debt-btn`);if(a?.dataset.tripId&&a.dataset.from&&a.dataset.to&&a.dataset.amount&&!a.disabled){a.disabled=!0,a.textContent=x(`settlement.recordingBtn`),R(a.dataset.tripId,a.dataset.from,a.dataset.to,parseFloat(a.dataset.amount),`EUR`);return}let o=t.closest(`.open-manual-settle-btn`);if(o?.dataset.tripId){V(o.dataset.tripId);return}let s=t.closest(`.edit-settlement-btn`);if(s?.dataset.settlementId){H(s.dataset.settlementId);return}let l=t.closest(`.unsettle-settlement-btn`);if(l?.dataset.settlementId){let e=l.dataset.source===`settlement`?`settlement`:`expense`;z(l.dataset.settlementId,e);return}},_=(0,w.useRef)(c);return _.current=c,(0,w.useEffect)(()=>{let e=p.current;if(!e)return;let t=e=>{let t=e.target;if(t?.id===`settlementTripSelect`){let e=t;e.value&&_.current(e.value)}};return e.addEventListener(`change`,t),()=>e.removeEventListener(`change`,t)},[]),(0,U.jsx)(`div`,{ref:p,onClick:m,dangerouslySetInnerHTML:{__html:d}})}function G(e){b(e,(0,w.createElement)(W))}export{G as mountSettlement};
//# sourceMappingURL=mount-DskcYE7W.js.map