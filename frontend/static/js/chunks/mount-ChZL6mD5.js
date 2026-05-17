import{r as e}from"./rolldown-runtime-C3V63i2j.js";import{r as t,t as n}from"./vendor-react-BRKukhy3.js";import{$t as r,C as i,Ct as a,Dt as o,Ft as s,Ht as c,Jt as l,Kt as u,Mt as d,O as f,Ot as p,Pt as m,St as h,Tt as g,Ut as _,kt as v,qt as y,rt as b,v as x,y as S}from"../app.bundle.js";import{t as C}from"./store-DSDm1BUI.js";import{n as w}from"./TripContext-BZCU70ZY.js";var T=e(t(),1);function E(e,t,n){let r=y(n,t.fromUserId)?.name,i=y(n,t.toUserId)?.name;if(!r||!i||e[r]===void 0||e[i]===void 0)return;let a=t.euroValue||t.amount||0;e[r]+=a,e[i]-=a}function D(e){if(!e)return{balances:{},roster:[],expenses:[]};let t=(c.expenses||[]).filter(t=>t.tripId===e.id),n=l(e),r=n.length>0?n:Array.from(new Set(t.flatMap(e=>[e.who,...Object.keys(e.splits||{})]).filter(Boolean))),i={};r.forEach(e=>i[e]=0);for(let e of t){let t=e.euroValue||e.value||0;if(i[e.who]!==void 0&&(i[e.who]+=t),e.splits&&Object.keys(e.splits).length>0)for(let[n,r]of Object.entries(e.splits))i[n]!==void 0&&(i[n]-=t*(Number(r)/100));else{let e=t/Math.max(r.length,1);r.forEach(t=>{i[t]!==void 0&&(i[t]-=e)})}}let a=(c.settlements||[]).filter(t=>t.tripId===e.id);for(let t of a)E(i,t,e);return{balances:i,roster:r,expenses:t}}function O(e){let t=[],n=[];for(let[r,i]of Object.entries(e))i>.01?t.push({person:r,amount:i}):i<-.01&&n.push({person:r,amount:Math.abs(i)});t.sort((e,t)=>t.amount-e.amount),n.sort((e,t)=>t.amount-e.amount);let r=[],i=0,a=0;for(;i<n.length&&a<t.length;){let e=n[i],o=t[a],s=Math.min(e.amount,o.amount);r.push({from:e.person,to:o.person,amount:s}),e.amount-=s,o.amount-=s,e.amount<.01&&i++,o.amount<.01&&a++}return r}function k(){let e={};for(let t of[...c.trips,...c.archivedTrips||[]])for(let n of l(t))n in e||(e[n]=0);let t=(c.archivedTrips||[]).flatMap(e=>e.expenses||[]),n=[...c.expenses,...t],r={};for(let e of[...c.trips,...c.archivedTrips||[]])r[e.id]=l(e);for(let t of n){let n=t.euroValue||t.value||0;if(e[t.who]!==void 0&&(e[t.who]+=n),t.splits&&Object.keys(t.splits).length>0)for(let[r,i]of Object.entries(t.splits))e[r]!==void 0&&(e[r]-=n*(Number(i)/100));else{let i=r[t.tripId]||[],a=i.length>0?i:Array.from(new Set([t.who,...Object.keys(t.splits||{})].filter(Boolean))),o=n/Math.max(a.length,1);a.forEach(t=>{e[t]!==void 0&&(e[t]-=o)})}}let i=new Map;for(let e of[...c.trips,...c.archivedTrips||[]])i.set(e.id,e);for(let t of c.settlements||[]){let n=i.get(t.tripId);n&&E(e,t,n)}return e}function A(e){if(!e)return[];let t=(c.expenses||[]).filter(t=>t.tripId===e.id),n=l(e),r={};n.forEach(e=>r[e]={paid:0,share:0});for(let e of t){let t=e.euroValue||e.value||0;if(r[e.who]&&(r[e.who].paid+=t),e.splits&&Object.keys(e.splits).length>0)for(let[n,i]of Object.entries(e.splits))r[n]&&(r[n].share+=t*(Number(i)/100));else{let e=t/Math.max(n.length,1);n.forEach(t=>{r[t]&&(r[t].share+=e)})}}return Object.entries(r).map(([e,t])=>({name:e,paid:t.paid,share:t.share,net:t.paid-t.share}))}function j(e){let t=0,n=0;for(let r of c.expenses||[])r.tripId===e&&r.isSettlement&&(t+=1,n+=r.euroValue||0);for(let r of c.settlements||[])r.tripId===e&&(t+=1,n+=r.euroValue||r.amount||0);return{count:t,eurTotal:n}}function M(e,t,n,r){let i=n===`global`?``:N(r),a=`
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #ffd60a; --g-to: #ff9f0a;">${x(`settlement.title`)}</h1>
            <p>${x(`settlement.subtitle`)}</p>
        </div>
        ${i}
    `;return e?`
        ${a}
        ${P(e,n)}
        ${n===`trip`?F(e,t):``}
        ${n===`history`?L(e,t):``}
        ${n===`global`?R():``}
    `:`
            ${a}
            <div class="card glass" style="text-align: center; padding: 60px 32px; margin-top: 24px; border-radius: 28px;">
                <div style="font-size: 4rem; margin-bottom: 12px;">⚖️</div>
                <h2 style="margin:0 0 6px;">${x(`settlement.noTripsTitle`)}</h2>
                <p class="text-muted">${x(`settlement.noTripsBody`)}</p>
            </div>
        `}function N(e){if(c.trips.length===0)return``;let t=c.trips.find(t=>t.id===e),n=t?j(t.id).eurTotal:0,r=c.trips.map(t=>{let n=j(t.id).eurTotal,r=n>0?` — ${m(n,`EUR`)} ${x(`settlement.settledSuffix`)}`:``;return`<option value="${g(t.id)}"${t.id===e?` selected`:``}>${g(t.name)}${r}</option>`}).join(``);return`
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
                    ${m(n,`EUR`)} ${x(`settlement.settledSuffix`)}
                </span>
            `:``}
        </div>
    `}function P(e,t){let n=j(e.id).count,r=(e,n,r)=>`
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
    `}function F(e,t){let{balances:n}=D(e),r=O(n),i=A(e),a=i.reduce((e,t)=>e+t.paid,0),o=[...i].sort((e,t)=>t.paid-e.paid)[0],s=[...i].sort((e,t)=>e.net-t.net)[0],c=[...i].sort((e,t)=>t.net-e.net)[0],l=g(e?.name||`Trip`),u=a>0?`
        <div class="card glass" style="margin-bottom: 18px; padding: 22px 26px; border-radius: 28px; background: linear-gradient(135deg, rgba(255,214,10,0.05), rgba(255,159,10,0.03)); border:1px solid rgba(255,159,10,0.18);">
            <div style="display:flex; flex-wrap:wrap; gap:24px; align-items:center; justify-content:space-between;">
                <div style="min-width:0;">
                    <div style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary); margin-bottom:6px;">${x(`settlement.tripTotal`)} · ${l}</div>
                    <div style="font-size:2rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.02em;">${m(a,`EUR`)}</div>
                </div>
                ${o?`
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${x(`settlement.topPayer`)}</div>
                        <div class="stl-heading-2">${g(o.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:var(--text-secondary);">${m(o.paid,`EUR`)}</div>
                    </div>
                `:``}
                ${c&&c.net>.01?`
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${x(`settlement.topOwed`)}</div>
                        <div class="stl-heading-2">${g(c.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#1a6b3c;">+${m(c.net,`EUR`)}</div>
                    </div>
                `:``}
                ${s&&s.net<-.01?`
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#ff3b30;">${x(`settlement.topOwes`)}</div>
                        <div class="stl-heading-2">${g(s.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#a30000;">${m(s.net,`EUR`)}</div>
                    </div>
                `:``}
            </div>
        </div>
    `:``,d=Object.entries(n).map(([e,t])=>{let n=t>.01,r=t<-.01;return`
            <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                <div style="width:34px; height:34px; border-radius:50%; background: ${n?`rgba(52,199,89,0.18)`:r?`rgba(255,59,48,0.18)`:`var(--surface-subtle)`}; color: ${n?`#1a6b3c`:r?`#a30000`:`var(--text-secondary)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                    ${g(e.charAt(0).toUpperCase())}
                </div>
                <div style="flex:1; min-width:0; font-weight:800; color: var(--text-brand-navy); font-size:0.95rem; overflow:hidden; text-overflow:ellipsis;">${g(e)}</div>
                <div style="font-weight:800; color: ${n?`#1a6b3c`:r?`#a30000`:`var(--text-secondary)`}; font-size:1rem;">
                    ${n?`+`:``}${m(t,`EUR`)}
                </div>
            </div>
        `}).join(``)||`<p class="text-muted" style="padding: 20px; text-align:center;">${x(`settlement.emptyNoCompanions`)}</p>`,f=r.length===0?`<div style="text-align:center; padding: 40px 20px;"><div style="font-size:2.2rem; margin-bottom:8px;">🥂</div><p style="margin:0; font-weight:800; color:#1a6b3c;">${x(`settlement.allSettledTitle`)}</p><p style="margin:6px 0 0; color:var(--text-secondary); font-size:0.85rem;">${x(`settlement.allSettledBody`)}</p></div>`:r.map(n=>`
            <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:16px;">
                <div class="stl-flex-grow-truncate">
                    <div class="stl-flex-row-wrap-6">
                        <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${g(n.from)}</span>
                        <span style="color:rgba(0,0,0,0.3);">→</span>
                        <span class="stl-heading-3">${g(n.to)}</span>
                    </div>
                    <div style="font-size:1.3rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.01em; margin-top:2px;">${m(n.amount,`EUR`)}</div>
                </div>
                ${t?`
                    <button class="btn-primary settle-debt-btn" data-trip-id="${g(e.id)}" data-from="${g(n.from)}" data-to="${g(n.to)}" data-amount="${n.amount}"
                        style="padding: 8px 18px; font-size:0.85rem; border-radius: 999px; flex-shrink:0;">${x(`settlement.settleBtn`)}</button>
                `:``}
            </div>
        `).join(``);return`
        ${u}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:18px; margin-bottom:24px;">
            <div class="card glass stl-card-major">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                    <h3 class="stl-heading-1">${x(`settlement.tripBalancesTitle`)} · ${l}</h3>
                    <span class="stl-section-label">${S(`settlement.peopleCount`,Object.keys(n).length)}</span>
                </div>
                <div class="stl-flex-col-8">
                    ${d}
                </div>
            </div>
            <div class="card glass stl-card-major">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
                    <div style="min-width:0;">
                        <h3 class="stl-heading-1">${x(`settlement.suggestedPaymentsTitle`)} · ${l}</h3>
                        <div style="font-size:0.7rem; font-weight:700; color:var(--text-secondary); margin-top:3px;">${x(`settlement.suggestedPaymentsSubtitle`)}</div>
                    </div>
                    <span class="stl-section-label--shrink-0">${S(`settlement.paymentsCount`,r.length)}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${f}
                </div>
            </div>
        </div>
        ${t?`
            <div style="text-align:center; margin-bottom: 24px;">
                <button class="btn-ghost open-manual-settle-btn" data-trip-id="${g(e.id)}" type="button"
                    style="background: var(--card-bg); border:1px solid var(--border-subtle); color: var(--text-brand-navy); padding: 10px 24px; border-radius: 999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow: 0 4px 12px rgba(0,45,91,0.05);">
                    ${x(`settlement.manualSettleOpenBtn`)}
                </button>
            </div>
        `:``}
    `}function I(e){let t=[];for(let n of c.expenses||[]){if(!(n.tripId===e.id&&n.isSettlement))continue;let r=Object.keys(n.splits||{})[0]||`?`;t.push({id:n.id,source:`expense`,who:n.who||`?`,to:r,euroValue:n.euroValue||0,date:n.date||``})}for(let n of c.settlements||[]){if(n.tripId!==e.id)continue;let r=y(e,n.fromUserId)?.name,i=y(e,n.toUserId)?.name;!r||!i||t.push({id:n.id,source:`settlement`,who:r,to:i,euroValue:n.euroValue||n.amount||0,date:(n.createdAt||``).slice(0,10),method:n.method??null,note:n.note??null})}return t.sort((e,t)=>new Date(t.date).getTime()-new Date(e.date).getTime()),t}function L(e,t){let n=I(e);if(n.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">📜</div>
                <h2 style="margin:0 0 6px; color: var(--text-brand-navy);">${x(`settlement.historyEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${x(`settlement.historyEmptyBody`)}</p>
            </div>
        `;let r={};for(let e of n){let t=e.date||`undated`;r[t]||(r[t]=[]),r[t].push(e)}let i=new Date().toISOString().slice(0,10),a=new Date;a.setDate(a.getDate()-1);let o=a.toISOString().slice(0,10),s=e=>{if(e===`undated`)return x(`settlement.historyDateNoDate`);if(e===i)return x(`settlement.historyDateToday`);if(e===o)return x(`settlement.historyDateYesterday`);let t=new Date(e);return isNaN(t.getTime())?e:t.toLocaleDateString(void 0,{weekday:`short`,month:`short`,day:`numeric`,year:`numeric`})},c=Object.keys(r).sort((e,t)=>e===`undated`?1:t===`undated`?-1:t.localeCompare(e));return`
        <div class="card glass stl-card-major">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <h3 class="stl-heading-1">${x(`settlement.historyTitle`)}</h3>
                <span class="stl-section-label">${x(`settlement.historyRecorded`,{count:n.length})}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:18px;">
                ${c.map(n=>{let i=r[n],a=i.reduce((e,t)=>e+(t.euroValue||0),0);return`
                        <div>
                            <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:8px; padding: 0 4px;">
                                <h4 style="margin:0; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary);">${g(s(n))}</h4>
                                <span style="font-size:0.72rem; font-weight:700; color:var(--text-secondary);">${S(`settlement.historyDayTotalPlural`,i.length,{amount:m(a,`EUR`)})}</span>
                            </div>
                            <div class="stl-flex-col-8">
                                ${i.map(n=>{let r=(n.who||`?`).charAt(0).toUpperCase(),i=n.method&&n.source===`settlement`?`<span style="display:inline-flex; align-items:center; gap:3px; background:rgba(0,113,227,0.08); color:var(--accent-blue-deep); padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">${g(n.method.replace(/_/g,` `))}</span>`:``,a=n.note&&n.source===`settlement`?`<div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px; font-style:italic;">"${g(n.note)}"</div>`:``,o=t&&n.source===`expense`?`<button class="edit-settlement-btn" data-settlement-id="${g(n.id)}" type="button"
                                                style="background:rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.22); color: var(--accent-blue-deep); padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${x(`settlement.historyEditBtn`)}</button>`:``,s=t?`<button class="unsettle-settlement-btn" data-settlement-id="${g(n.id)}" data-source="${g(n.source)}" data-trip-id="${g(e.id)}" type="button"
                                                style="background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.22); color:#ff3b30; padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${x(`settlement.historyUnsettleBtn`)}</button>`:``;return`
                                        <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                                            <div style="width:34px; height:34px; border-radius:50%; background:rgba(52,199,89,0.12); color:#1a6b3c; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">${g(r)}</div>
                                            <div class="stl-flex-grow-truncate">
                                                <div class="stl-flex-row-wrap-6">
                                                    <span class="stl-heading-3">${g(n.who)}</span>
                                                    <span style="color:rgba(0,0,0,0.3); font-weight:600;">→</span>
                                                    <span class="stl-heading-3">${g(n.to)}</span>
                                                    <span style="display:inline-flex; align-items:center; gap:3px; background:rgba(52,199,89,0.12); color:#1a6b3c; padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${x(`settlement.historyChipSettled`)}</span>
                                                    ${i}
                                                </div>
                                                ${a}
                                            </div>
                                            <div style="font-size:1rem; font-weight:800; color:#1a6b3c; flex-shrink:0;">${m(n.euroValue||0,`EUR`)}</div>
                                            ${t&&(o||s)?`<div style="display:flex; gap:6px; flex-shrink:0;">${o}${s}</div>`:``}
                                        </div>
                                    `}).join(``)}
                            </div>
                        </div>
                    `}).join(``)}
            </div>
        </div>
    `}function R(){let e=k(),t=Object.entries(e).sort((e,t)=>t[1]-e[1]),n=Math.max(...Object.values(e).map(Math.abs),1),r=t.some(([,e])=>Math.abs(e)>.01);if(t.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">🌍</div>
                <h2 style="margin:0 0 6px; color: var(--text-brand-navy);">${x(`settlement.crossTripEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${x(`settlement.crossTripEmptyBody`)}</p>
            </div>
        `;let i=O(e);return`
        <div class="card glass stl-card-major">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                <h3 class="stl-heading-1">${x(`settlement.crossTripTitle`)}</h3>
                <span class="stl-section-label">${x(`settlement.crossTripSubtitle`)}</span>
            </div>
            <div class="stl-flex-col-8">
                ${t.map(([e,t])=>{let i=r?Math.min(Math.abs(t)/n*100,100):0,a=t>.01,o=t<-.01,s=a?`#1a6b3c`:o?`#a30000`:`var(--text-secondary)`;return`
                        <div style="display:flex; flex-direction:column; gap:10px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                            <div style="display:flex; align-items:center; gap:14px;">
                                <div style="width:34px; height:34px; border-radius:50%; background: ${a?`rgba(52,199,89,0.12)`:o?`rgba(255,59,48,0.1)`:`var(--surface-subtle)`}; color: ${a?`#1a6b3c`:o?`#a30000`:`var(--text-secondary)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                                    ${g(e.charAt(0).toUpperCase())}
                                </div>
                                <div style="flex:1; min-width:0; font-weight:800; color: var(--text-brand-navy); font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${g(e)}</div>
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
                                    <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${g(e.from)}</span>
                                    <span style="color:rgba(0,0,0,0.3);">→</span>
                                    <span class="stl-heading-3">${g(e.to)}</span>
                                </div>
                                <div style="font-size:1.3rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.01em; margin-top:2px;">${m(e.amount,`EUR`)}</div>
                            </div>
                        </div>
                    `).join(``)}
                </div>
            </div>
        `:``}
    `}async function z(e,t,n,a,s,l){if(t===n){v(x(`settlement.toastSenderEqualsReceiver`));return}if(!Number.isFinite(a)||a<=0){v(x(`settlement.toastAmountInvalid`));return}let f=d(a,s,`EUR`),p=c.trips.find(t=>t.id===e),h=u(p,t)?.linkedUserId,g=u(p,n)?.linkedUserId;if(h&&g){let o=await i({tripId:e,fromUserId:h,toUserId:g,amount:a,currency:s,euroValue:f,...l?.method?{method:l.method}:{},...l?.note?{note:l.note}:{}});o.settlement?(c.settlements.push(o.settlement),_(r.STATE_CHANGED),v(`Recorded ${m(f,`EUR`)} ${t} → ${n} · notified ${n}`)):(console.warn(`[settlement] /api/settlements failed:`,o.error),v(`Settlement failed: ${o.error||`Network error`}`));return}let y={id:o(),tripId:e,label:`Settlement: ${t} → ${n}`,value:a,euroValue:f,currency:s,who:t,categoryId:c.categories[0]?.id??``,country:x(`settlement.expenseCountry`),date:new Date().toISOString().split(`T`)[0]??``,splits:{[n]:100},isSettlement:!0};c.expenses.push(y),_(r.STATE_CHANGED),v(`Recorded ${m(f,`EUR`)} ${t} → ${n}`)}async function B(e,t=`expense`){h({title:x(`settlement.toastUnsettleConfirmTitle`),message:x(`settlement.toastUnsettleConfirmMessage`),confirmText:x(`settlement.toastUnsettleConfirmBtn`),onConfirm:async()=>{if(t===`settlement`){let t=await f(e);if(t.error){console.warn(`[settlement] delete failed:`,t.error),v(`Couldn't undo: ${t.error||`Network error`}`);return}c.settlements=c.settlements.filter(t=>t.id!==e),_(r.STATE_CHANGED);return}c.expenses=c.expenses.filter(t=>t.id!==e),_(r.STATE_CHANGED)}})}var V=[{value:`cash`,label:`Cash`},{value:`revolut`,label:`Revolut`},{value:`bank_transfer`,label:`Bank transfer`},{value:`wise`,label:`Wise`},{value:`paypal`,label:`PayPal`},{value:`custom`,label:`Custom`}];function H(e){let t=l(c.trips.find(t=>t.id===e)).map(e=>`<option value="${g(e)}">${g(e)}</option>`).join(``),n=V.map(e=>`<option value="${g(e.value)}">${g(e.label)}</option>`).join(``),r=s(),{root:i,close:o}=a({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${x(`settlement.manualTitle`)}</h2>
            <p class="text-subtitle">${x(`settlement.manualSubtitle`)}</p>
            <form id="manualSettleForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">From</label>
                <select id="manualSettleFrom" class="glass-input stl-card-minor-bg">${t}</select>
                <label class="form-label stl-mt-6">To</label>
                <select id="manualSettleTo" class="glass-input stl-card-minor-bg">${t}</select>
                <label class="form-label stl-mt-6">Amount (${g(r)})</label>
                <input type="number" step="0.01" min="0.01" id="manualSettleAmount" class="glass-input" placeholder="0.00" required class="stl-card-minor">
                <label class="form-label stl-mt-6">Method</label>
                <select id="manualSettleMethod" class="glass-input stl-card-minor-bg">${n}</select>
                <label class="form-label stl-mt-6">Note <span class="text-subtitle" style="font-weight:500;">(optional)</span></label>
                <input type="text" id="manualSettleNote" class="glass-input" maxlength="240" placeholder="e.g. Cash at the airport" class="stl-card-minor">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelManualSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">Cancel</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">Record payment</button>
                </div>
            </form>
        `});p(i,`#cancelManualSettleBtn`).onclick=()=>o(),p(i,`#manualSettleForm`).onsubmit=t=>{t.preventDefault();let n=p(i,`#manualSettleFrom`).value,a=p(i,`#manualSettleTo`).value,s=parseFloat(p(i,`#manualSettleAmount`).value),c=p(i,`#manualSettleMethod`).value,l=p(i,`#manualSettleNote`).value.trim();if(n===a){v(x(`settlement.toastSenderEqualsReceiver`));return}z(e,n,a,s,r,{method:c,note:l}),o()}}function U(e){let t=c.expenses.find(t=>t.id===e);if(!t)return;let n=l(c.trips.find(e=>e.id===t.tripId)),i=n.map(e=>`<option value="${g(e)}" ${t.who===e?`selected`:``}>${g(e)}</option>`).join(``),o=Object.keys(t.splits||{})[0],u=n.map(e=>`<option value="${g(e)}" ${o===e?`selected`:``}>${g(e)}</option>`).join(``),f=s(),{root:m,close:h}=a({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${x(`settlement.editTitle`)}</h2>
            <form id="editSettlementForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">From</label>
                <select id="editSettleFrom" class="glass-input stl-card-minor-bg">${i}</select>
                <label class="form-label stl-mt-6">To</label>
                <select id="editSettleTo" class="glass-input stl-card-minor-bg">${u}</select>
                <label class="form-label stl-mt-6">Amount (${g(f)})</label>
                <input type="number" step="0.01" min="0.01" id="editSettleAmount" value="${d(t.euroValue||0,`EUR`,f).toFixed(2)}" class="glass-input" required class="stl-card-minor">
                <label class="form-label stl-mt-6">Date</label>
                <input type="date" id="editSettleDate" value="${g(t.date||``)}" class="glass-input" required class="stl-card-minor">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelEditSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">Cancel</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">Update</button>
                </div>
            </form>
        `});p(m,`#cancelEditSettleBtn`).onclick=()=>h(),p(m,`#editSettlementForm`).onsubmit=e=>{e.preventDefault();let n=p(m,`#editSettleFrom`).value,i=p(m,`#editSettleTo`).value,a=parseFloat(p(m,`#editSettleAmount`).value),o=p(m,`#editSettleDate`).value;if(n===i){v(x(`settlement.toastSenderEqualsReceiver`));return}t.who=n,t.splits={[i]:100},t.value=a,t.currency=f,t.euroValue=d(a,f,`EUR`),t.date=o,t.label=`Settlement: ${n} → ${i}`,_(r.STATE_CHANGED),h()}}var W=n();function G(){let e=C(e=>e.trips),t=C(e=>e.activeTripId),n=C(e=>e.expenses),[i,a]=(0,T.useState)(`trip`),[o,s]=(0,T.useState)(()=>t||(e.length>0?e[0].id:null));(0,T.useEffect)(()=>{t&&t!==o&&s(t)},[t,o]),(0,T.useEffect)(()=>{if(o&&!e.find(e=>e.id===o)){let t=e.length>0?e[0].id:null;s(t),t&&(c.activeTripId=t,_(r.STATE_CHANGED))}},[e,o]);let l=e=>{s(e),c.activeTripId=e,_(r.STATE_CHANGED),i===`global`&&a(`trip`)},{trip:u,canEditExpenses:d}=w(o),f=(0,T.useMemo)(()=>M(u,d,i,o),[u,d,i,o,n]),p=(0,T.useRef)(null),m=e=>{let t=e.target;if(!t)return;let n=t.closest(`.settlement-trip-pill`);if(n?.dataset.tripId){l(n.dataset.tripId);return}let r=t.closest(`.settle-tab`);if(r?.dataset.tab){a(r.dataset.tab);return}let i=t.closest(`.settle-debt-btn`);if(i?.dataset.tripId&&i.dataset.from&&i.dataset.to&&i.dataset.amount&&!i.disabled){i.disabled=!0,i.textContent=x(`settlement.recordingBtn`),z(i.dataset.tripId,i.dataset.from,i.dataset.to,parseFloat(i.dataset.amount),`EUR`);return}let o=t.closest(`.open-manual-settle-btn`);if(o?.dataset.tripId){H(o.dataset.tripId);return}let s=t.closest(`.edit-settlement-btn`);if(s?.dataset.settlementId){U(s.dataset.settlementId);return}let c=t.closest(`.unsettle-settlement-btn`);if(c?.dataset.settlementId){let e=c.dataset.source===`settlement`?`settlement`:`expense`;B(c.dataset.settlementId,e);return}},h=(0,T.useRef)(l);return h.current=l,(0,T.useEffect)(()=>{let e=p.current;if(!e)return;let t=e=>{let t=e.target;if(t?.id===`settlementTripSelect`){let e=t;e.value&&h.current(e.value)}};return e.addEventListener(`change`,t),()=>e.removeEventListener(`change`,t)},[]),(0,W.jsx)(`div`,{ref:p,onClick:m,dangerouslySetInnerHTML:{__html:f}})}function K(e){b(e,(0,T.createElement)(G))}export{K as mountSettlement};
//# sourceMappingURL=mount-ChZL6mD5.js.map