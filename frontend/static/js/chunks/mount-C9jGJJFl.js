import{r as e,t}from"./vendor-react-CAxw18f3.js";import{$t as n,C as r,Ct as i,Dt as a,Ft as o,Ht as s,Jt as c,Kt as l,Mt as u,O as d,Ot as f,Pt as p,St as m,Tt as h,Ut as g,kt as _,qt as v,rt as y,v as b,y as x}from"../app.bundle.js";import{t as S}from"./store-8RffWTaY.js";import{n as C}from"./TripContext-D5zgJl5p.js";var w=e();function T(e,t,n){let r=v(n,t.fromUserId)?.name,i=v(n,t.toUserId)?.name;if(!r||!i||e[r]===void 0||e[i]===void 0)return;let a=t.euroValue||t.amount||0;e[r]+=a,e[i]-=a}function E(e){if(!e)return{balances:{},roster:[],expenses:[]};let t=(s.expenses||[]).filter(t=>t.tripId===e.id),n=c(e),r=n.length>0?n:Array.from(new Set(t.flatMap(e=>[e.who,...Object.keys(e.splits||{})]).filter(Boolean))),i={};r.forEach(e=>i[e]=0);for(let e of t){let t=e.euroValue||e.value||0;if(i[e.who]!==void 0&&(i[e.who]+=t),e.splits&&Object.keys(e.splits).length>0)for(let[n,r]of Object.entries(e.splits))i[n]!==void 0&&(i[n]-=t*(Number(r)/100));else{let e=t/Math.max(r.length,1);r.forEach(t=>{i[t]!==void 0&&(i[t]-=e)})}}let a=(s.settlements||[]).filter(t=>t.tripId===e.id);for(let t of a)T(i,t,e);return{balances:i,roster:r,expenses:t}}function D(e){let t=[],n=[];for(let[r,i]of Object.entries(e))i>.01?t.push({person:r,amount:i}):i<-.01&&n.push({person:r,amount:Math.abs(i)});t.sort((e,t)=>t.amount-e.amount),n.sort((e,t)=>t.amount-e.amount);let r=[],i=0,a=0;for(;i<n.length&&a<t.length;){let e=n[i],o=t[a],s=Math.min(e.amount,o.amount);r.push({from:e.person,to:o.person,amount:s}),e.amount-=s,o.amount-=s,e.amount<.01&&i++,o.amount<.01&&a++}return r}function O(){let e={};for(let t of[...s.trips,...s.archivedTrips||[]])for(let n of c(t))n in e||(e[n]=0);let t=(s.archivedTrips||[]).flatMap(e=>e.expenses||[]),n=[...s.expenses,...t],r={};for(let e of[...s.trips,...s.archivedTrips||[]])r[e.id]=c(e);for(let t of n){let n=t.euroValue||t.value||0;if(e[t.who]!==void 0&&(e[t.who]+=n),t.splits&&Object.keys(t.splits).length>0)for(let[r,i]of Object.entries(t.splits))e[r]!==void 0&&(e[r]-=n*(Number(i)/100));else{let i=r[t.tripId]||[],a=i.length>0?i:Array.from(new Set([t.who,...Object.keys(t.splits||{})].filter(Boolean))),o=n/Math.max(a.length,1);a.forEach(t=>{e[t]!==void 0&&(e[t]-=o)})}}let i=new Map;for(let e of[...s.trips,...s.archivedTrips||[]])i.set(e.id,e);for(let t of s.settlements||[]){let n=i.get(t.tripId);n&&T(e,t,n)}return e}function k(e){if(!e)return[];let t=(s.expenses||[]).filter(t=>t.tripId===e.id),n=c(e),r={};n.forEach(e=>r[e]={paid:0,share:0});for(let e of t){let t=e.euroValue||e.value||0;if(r[e.who]&&(r[e.who].paid+=t),e.splits&&Object.keys(e.splits).length>0)for(let[n,i]of Object.entries(e.splits))r[n]&&(r[n].share+=t*(Number(i)/100));else{let e=t/Math.max(n.length,1);n.forEach(t=>{r[t]&&(r[t].share+=e)})}}return Object.entries(r).map(([e,t])=>({name:e,paid:t.paid,share:t.share,net:t.paid-t.share}))}function A(e){let t=0,n=0;for(let r of s.expenses||[])r.tripId===e&&r.isSettlement&&(t+=1,n+=r.euroValue||0);for(let r of s.settlements||[])r.tripId===e&&(t+=1,n+=r.euroValue||r.amount||0);return{count:t,eurTotal:n}}function j(e,t,n,r){let i=n===`global`?``:M(r),a=`
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #ffd60a; --g-to: #ff9f0a;">${b(`settlement.title`)}</h1>
            <p>${b(`settlement.subtitle`)}</p>
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
                <h2 style="margin:0 0 6px;">${b(`settlement.noTripsTitle`)}</h2>
                <p class="text-muted">${b(`settlement.noTripsBody`)}</p>
            </div>
        `}function M(e){if(s.trips.length===0)return``;let t=s.trips.find(t=>t.id===e),n=t?A(t.id).eurTotal:0,r=s.trips.map(t=>{let n=A(t.id).eurTotal,r=n>0?` — ${p(n,`EUR`)} ${b(`settlement.settledSuffix`)}`:``;return`<option value="${h(t.id)}"${t.id===e?` selected`:``}>${h(t.name)}${r}</option>`}).join(``);return`
        <div class="settlement-trip-picker" style="margin-top: 18px; margin-bottom: 16px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <label for="settlementTripSelect" style="display:inline-flex; align-items:center; gap:8px; font-size:0.74rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-secondary); flex-shrink:0;">
                <span style="font-size:0.95rem;">⚖️</span>
                ${b(`settlement.tripPickerLabel`)}
            </label>
            <select id="settlementTripSelect" class="settlement-trip-select"
                aria-label="${b(`settlement.tripPickerAriaLabel`)}"
                style="flex:1; min-width:200px; max-width:380px; padding:10px 14px; border-radius:12px; border:1.5px solid rgba(255,159,10,0.4); background:linear-gradient(135deg, rgba(255,214,10,0.08), rgba(255,159,10,0.04)); font-size:0.92rem; font-weight:700; color: var(--text-brand-navy); cursor:pointer; outline:none; font-family:inherit; transition: border-color 0.18s ease, box-shadow 0.18s ease;">
                ${r}
            </select>
            ${t&&n>0?`
                <span style="display:inline-flex; align-items:center; padding:6px 12px; border-radius:999px; background:rgba(0,113,227,0.08); color: var(--accent-blue-deep); font-size:0.78rem; font-weight:800; flex-shrink:0;">
                    ${p(n,`EUR`)} ${b(`settlement.settledSuffix`)}
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
            ${r(`trip`,b(`settlement.tabThisTrip`))}
            ${r(`history`,b(`settlement.tabHistory`),n)}
            ${r(`global`,b(`settlement.tabCrossTrip`))}
        </nav>
    `}function P(e,t){let{balances:n}=E(e),r=D(n),i=k(e),a=i.reduce((e,t)=>e+t.paid,0),o=[...i].sort((e,t)=>t.paid-e.paid)[0],s=[...i].sort((e,t)=>e.net-t.net)[0],c=[...i].sort((e,t)=>t.net-e.net)[0],l=h(e?.name||`Trip`),u=a>0?`
        <div class="card glass" style="margin-bottom: 18px; padding: 22px 26px; border-radius: 28px; background: linear-gradient(135deg, rgba(255,214,10,0.05), rgba(255,159,10,0.03)); border:1px solid rgba(255,159,10,0.18);">
            <div style="display:flex; flex-wrap:wrap; gap:24px; align-items:center; justify-content:space-between;">
                <div style="min-width:0;">
                    <div style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary); margin-bottom:6px;">${b(`settlement.tripTotal`)} · ${l}</div>
                    <div style="font-size:2rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.02em;">${p(a,`EUR`)}</div>
                </div>
                ${o?`
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${b(`settlement.topPayer`)}</div>
                        <div style="font-size:1.1rem; font-weight:800; color: var(--text-brand-navy); margin-top:4px;">${h(o.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:var(--text-secondary);">${p(o.paid,`EUR`)}</div>
                    </div>
                `:``}
                ${c&&c.net>.01?`
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${b(`settlement.topOwed`)}</div>
                        <div style="font-size:1.1rem; font-weight:800; color: var(--text-brand-navy); margin-top:4px;">${h(c.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#1a6b3c;">+${p(c.net,`EUR`)}</div>
                    </div>
                `:``}
                ${s&&s.net<-.01?`
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#ff3b30;">${b(`settlement.topOwes`)}</div>
                        <div style="font-size:1.1rem; font-weight:800; color: var(--text-brand-navy); margin-top:4px;">${h(s.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#a30000;">${p(s.net,`EUR`)}</div>
                    </div>
                `:``}
            </div>
        </div>
    `:``,d=Object.entries(n).map(([e,t])=>{let n=t>.01,r=t<-.01;return`
            <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                <div style="width:34px; height:34px; border-radius:50%; background: ${n?`rgba(52,199,89,0.18)`:r?`rgba(255,59,48,0.18)`:`var(--surface-subtle)`}; color: ${n?`#1a6b3c`:r?`#a30000`:`var(--text-secondary)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                    ${h(e.charAt(0).toUpperCase())}
                </div>
                <div style="flex:1; min-width:0; font-weight:800; color: var(--text-brand-navy); font-size:0.95rem; overflow:hidden; text-overflow:ellipsis;">${h(e)}</div>
                <div style="font-weight:800; color: ${n?`#1a6b3c`:r?`#a30000`:`var(--text-secondary)`}; font-size:1rem;">
                    ${n?`+`:``}${p(t,`EUR`)}
                </div>
            </div>
        `}).join(``)||`<p class="text-muted" style="padding: 20px; text-align:center;">${b(`settlement.emptyNoCompanions`)}</p>`,f=r.length===0?`<div style="text-align:center; padding: 40px 20px;"><div style="font-size:2.2rem; margin-bottom:8px;">🥂</div><p style="margin:0; font-weight:800; color:#1a6b3c;">${b(`settlement.allSettledTitle`)}</p><p style="margin:6px 0 0; color:var(--text-secondary); font-size:0.85rem;">${b(`settlement.allSettledBody`)}</p></div>`:r.map(n=>`
            <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:16px;">
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${h(n.from)}</span>
                        <span style="color:rgba(0,0,0,0.3);">→</span>
                        <span style="font-weight:800; color: var(--text-brand-navy); font-size:0.95rem;">${h(n.to)}</span>
                    </div>
                    <div style="font-size:1.3rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.01em; margin-top:2px;">${p(n.amount,`EUR`)}</div>
                </div>
                ${t?`
                    <button class="btn-primary settle-debt-btn" data-trip-id="${h(e.id)}" data-from="${h(n.from)}" data-to="${h(n.to)}" data-amount="${n.amount}"
                        style="padding: 8px 18px; font-size:0.85rem; border-radius: 999px; flex-shrink:0;">${b(`settlement.settleBtn`)}</button>
                `:``}
            </div>
        `).join(``);return`
        ${u}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:18px; margin-bottom:24px;">
            <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                    <h3 style="margin:0; font-size:1.05rem; color: var(--text-brand-navy); font-weight:800; letter-spacing:-0.02em;">${b(`settlement.tripBalancesTitle`)} · ${l}</h3>
                    <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${x(`settlement.peopleCount`,Object.keys(n).length)}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    ${d}
                </div>
            </div>
            <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
                    <div style="min-width:0;">
                        <h3 style="margin:0; font-size:1.05rem; color: var(--text-brand-navy); font-weight:800; letter-spacing:-0.02em;">${b(`settlement.suggestedPaymentsTitle`)} · ${l}</h3>
                        <div style="font-size:0.7rem; font-weight:700; color:var(--text-secondary); margin-top:3px;">${b(`settlement.suggestedPaymentsSubtitle`)}</div>
                    </div>
                    <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em; flex-shrink:0;">${x(`settlement.paymentsCount`,r.length)}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${f}
                </div>
            </div>
        </div>
        ${t?`
            <div style="text-align:center; margin-bottom: 24px;">
                <button class="btn-ghost open-manual-settle-btn" data-trip-id="${h(e.id)}" type="button"
                    style="background: var(--card-bg); border:1px solid var(--border-subtle); color: var(--text-brand-navy); padding: 10px 24px; border-radius: 999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow: 0 4px 12px rgba(0,45,91,0.05);">
                    ${b(`settlement.manualSettleOpenBtn`)}
                </button>
            </div>
        `:``}
    `}function F(e){let t=[];for(let n of s.expenses||[]){if(!(n.tripId===e.id&&n.isSettlement))continue;let r=Object.keys(n.splits||{})[0]||`?`;t.push({id:n.id,source:`expense`,who:n.who||`?`,to:r,euroValue:n.euroValue||0,date:n.date||``})}for(let n of s.settlements||[]){if(n.tripId!==e.id)continue;let r=v(e,n.fromUserId)?.name,i=v(e,n.toUserId)?.name;!r||!i||t.push({id:n.id,source:`settlement`,who:r,to:i,euroValue:n.euroValue||n.amount||0,date:(n.createdAt||``).slice(0,10),method:n.method??null,note:n.note??null})}return t.sort((e,t)=>new Date(t.date).getTime()-new Date(e.date).getTime()),t}function I(e,t){let n=F(e);if(n.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">📜</div>
                <h2 style="margin:0 0 6px; color: var(--text-brand-navy);">${b(`settlement.historyEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${b(`settlement.historyEmptyBody`)}</p>
            </div>
        `;let r={};for(let e of n){let t=e.date||`undated`;r[t]||(r[t]=[]),r[t].push(e)}let i=new Date().toISOString().slice(0,10),a=new Date;a.setDate(a.getDate()-1);let o=a.toISOString().slice(0,10),s=e=>{if(e===`undated`)return b(`settlement.historyDateNoDate`);if(e===i)return b(`settlement.historyDateToday`);if(e===o)return b(`settlement.historyDateYesterday`);let t=new Date(e);return isNaN(t.getTime())?e:t.toLocaleDateString(void 0,{weekday:`short`,month:`short`,day:`numeric`,year:`numeric`})},c=Object.keys(r).sort((e,t)=>e===`undated`?1:t===`undated`?-1:t.localeCompare(e));return`
        <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <h3 style="margin:0; font-size:1.05rem; color: var(--text-brand-navy); font-weight:800; letter-spacing:-0.02em;">${b(`settlement.historyTitle`)}</h3>
                <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${b(`settlement.historyRecorded`,{count:n.length})}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:18px;">
                ${c.map(n=>{let i=r[n],a=i.reduce((e,t)=>e+(t.euroValue||0),0);return`
                        <div>
                            <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:8px; padding: 0 4px;">
                                <h4 style="margin:0; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary);">${h(s(n))}</h4>
                                <span style="font-size:0.72rem; font-weight:700; color:var(--text-secondary);">${x(`settlement.historyDayTotalPlural`,i.length,{amount:p(a,`EUR`)})}</span>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                ${i.map(n=>{let r=(n.who||`?`).charAt(0).toUpperCase(),i=n.method&&n.source===`settlement`?`<span style="display:inline-flex; align-items:center; gap:3px; background:rgba(0,113,227,0.08); color:var(--accent-blue-deep); padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">${h(n.method.replace(/_/g,` `))}</span>`:``,a=n.note&&n.source===`settlement`?`<div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px; font-style:italic;">"${h(n.note)}"</div>`:``,o=t&&n.source===`expense`?`<button class="edit-settlement-btn" data-settlement-id="${h(n.id)}" type="button"
                                                style="background:rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.22); color: var(--accent-blue-deep); padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${b(`settlement.historyEditBtn`)}</button>`:``,s=t?`<button class="unsettle-settlement-btn" data-settlement-id="${h(n.id)}" data-source="${h(n.source)}" data-trip-id="${h(e.id)}" type="button"
                                                style="background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.22); color:#ff3b30; padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${b(`settlement.historyUnsettleBtn`)}</button>`:``;return`
                                        <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                                            <div style="width:34px; height:34px; border-radius:50%; background:rgba(52,199,89,0.12); color:#1a6b3c; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">${h(r)}</div>
                                            <div style="flex:1; min-width:0;">
                                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                                    <span style="font-weight:800; color: var(--text-brand-navy); font-size:0.95rem;">${h(n.who)}</span>
                                                    <span style="color:rgba(0,0,0,0.3); font-weight:600;">→</span>
                                                    <span style="font-weight:800; color: var(--text-brand-navy); font-size:0.95rem;">${h(n.to)}</span>
                                                    <span style="display:inline-flex; align-items:center; gap:3px; background:rgba(52,199,89,0.12); color:#1a6b3c; padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${b(`settlement.historyChipSettled`)}</span>
                                                    ${i}
                                                </div>
                                                ${a}
                                            </div>
                                            <div style="font-size:1rem; font-weight:800; color:#1a6b3c; flex-shrink:0;">${p(n.euroValue||0,`EUR`)}</div>
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
                <h2 style="margin:0 0 6px; color: var(--text-brand-navy);">${b(`settlement.crossTripEmptyTitle`)}</h2>
                <p class="text-muted" style="margin:0;">${b(`settlement.crossTripEmptyBody`)}</p>
            </div>
        `;let i=D(e);return`
        <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                <h3 style="margin:0; font-size:1.05rem; color: var(--text-brand-navy); font-weight:800; letter-spacing:-0.02em;">${b(`settlement.crossTripTitle`)}</h3>
                <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${b(`settlement.crossTripSubtitle`)}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
                ${t.map(([e,t])=>{let i=r?Math.min(Math.abs(t)/n*100,100):0,a=t>.01,o=t<-.01,s=a?`#1a6b3c`:o?`#a30000`:`var(--text-secondary)`;return`
                        <div style="display:flex; flex-direction:column; gap:10px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                            <div style="display:flex; align-items:center; gap:14px;">
                                <div style="width:34px; height:34px; border-radius:50%; background: ${a?`rgba(52,199,89,0.12)`:o?`rgba(255,59,48,0.1)`:`var(--surface-subtle)`}; color: ${a?`#1a6b3c`:o?`#a30000`:`var(--text-secondary)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                                    ${h(e.charAt(0).toUpperCase())}
                                </div>
                                <div style="flex:1; min-width:0; font-weight:800; color: var(--text-brand-navy); font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${h(e)}</div>
                                <div style="font-weight:800; color: ${s}; font-size:1rem;">
                                    ${a?`+`:``}${p(t,`EUR`)}
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
                                    <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${h(e.from)}</span>
                                    <span style="color:rgba(0,0,0,0.3);">→</span>
                                    <span style="font-weight:800; color: var(--text-brand-navy); font-size:0.95rem;">${h(e.to)}</span>
                                </div>
                                <div style="font-size:1.3rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.01em; margin-top:2px;">${p(e.amount,`EUR`)}</div>
                            </div>
                        </div>
                    `).join(``)}
                </div>
            </div>
        `:``}
    `}async function R(e,t,i,o,c,d){if(t===i){_(b(`settlement.toastSenderEqualsReceiver`));return}if(!Number.isFinite(o)||o<=0){_(b(`settlement.toastAmountInvalid`));return}let f=u(o,c,`EUR`),m=s.trips.find(t=>t.id===e),h=l(m,t)?.linkedUserId,v=l(m,i)?.linkedUserId;if(h&&v){let a=await r({tripId:e,fromUserId:h,toUserId:v,amount:o,currency:c,euroValue:f,...d?.method?{method:d.method}:{},...d?.note?{note:d.note}:{}});a.settlement?(s.settlements.push(a.settlement),g(n.STATE_CHANGED),_(`Recorded ${p(f,`EUR`)} ${t} → ${i} · notified ${i}`)):(console.warn(`[settlement] /api/settlements failed:`,a.error),_(`Settlement failed: ${a.error||`Network error`}`));return}let y={id:a(),tripId:e,label:`Settlement: ${t} → ${i}`,value:o,euroValue:f,currency:c,who:t,categoryId:s.categories[0]?.id??``,country:b(`settlement.expenseCountry`),date:new Date().toISOString().split(`T`)[0]??``,splits:{[i]:100},isSettlement:!0};s.expenses.push(y),g(n.STATE_CHANGED),_(`Recorded ${p(f,`EUR`)} ${t} → ${i}`)}async function z(e,t=`expense`){m({title:b(`settlement.toastUnsettleConfirmTitle`),message:b(`settlement.toastUnsettleConfirmMessage`),confirmText:b(`settlement.toastUnsettleConfirmBtn`),onConfirm:async()=>{if(t===`settlement`){let t=await d(e);if(t.error){console.warn(`[settlement] delete failed:`,t.error),_(`Couldn't undo: ${t.error||`Network error`}`);return}s.settlements=s.settlements.filter(t=>t.id!==e),g(n.STATE_CHANGED);return}s.expenses=s.expenses.filter(t=>t.id!==e),g(n.STATE_CHANGED)}})}var B=[{value:`cash`,label:`Cash`},{value:`revolut`,label:`Revolut`},{value:`bank_transfer`,label:`Bank transfer`},{value:`wise`,label:`Wise`},{value:`paypal`,label:`PayPal`},{value:`custom`,label:`Custom`}];function V(e){let t=c(s.trips.find(t=>t.id===e)).map(e=>`<option value="${h(e)}">${h(e)}</option>`).join(``),n=B.map(e=>`<option value="${h(e.value)}">${h(e.label)}</option>`).join(``),r=o(),{root:a,close:l}=i({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${b(`settlement.manualTitle`)}</h2>
            <p class="text-subtitle">${b(`settlement.manualSubtitle`)}</p>
            <form id="manualSettleForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">From</label>
                <select id="manualSettleFrom" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background: var(--card-bg);">${t}</select>
                <label class="form-label" style="margin-top:6px;">To</label>
                <select id="manualSettleTo" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background: var(--card-bg);">${t}</select>
                <label class="form-label" style="margin-top:6px;">Amount (${h(r)})</label>
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
        `});f(a,`#cancelManualSettleBtn`).onclick=()=>l(),f(a,`#manualSettleForm`).onsubmit=t=>{t.preventDefault();let n=f(a,`#manualSettleFrom`).value,i=f(a,`#manualSettleTo`).value,o=parseFloat(f(a,`#manualSettleAmount`).value),s=f(a,`#manualSettleMethod`).value,c=f(a,`#manualSettleNote`).value.trim();if(n===i){_(b(`settlement.toastSenderEqualsReceiver`));return}R(e,n,i,o,r,{method:s,note:c}),l()}}function H(e){let t=s.expenses.find(t=>t.id===e);if(!t)return;let r=c(s.trips.find(e=>e.id===t.tripId)),a=r.map(e=>`<option value="${h(e)}" ${t.who===e?`selected`:``}>${h(e)}</option>`).join(``),l=Object.keys(t.splits||{})[0],d=r.map(e=>`<option value="${h(e)}" ${l===e?`selected`:``}>${h(e)}</option>`).join(``),p=o(),{root:m,close:v}=i({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">${b(`settlement.editTitle`)}</h2>
            <form id="editSettlementForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">From</label>
                <select id="editSettleFrom" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background: var(--card-bg);">${a}</select>
                <label class="form-label" style="margin-top:6px;">To</label>
                <select id="editSettleTo" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background: var(--card-bg);">${d}</select>
                <label class="form-label" style="margin-top:6px;">Amount (${h(p)})</label>
                <input type="number" step="0.01" min="0.01" id="editSettleAmount" value="${u(t.euroValue||0,`EUR`,p).toFixed(2)}" class="glass-input" required style="padding: var(--space-3); border-radius: 12px;">
                <label class="form-label" style="margin-top:6px;">Date</label>
                <input type="date" id="editSettleDate" value="${h(t.date||``)}" class="glass-input" required style="padding: var(--space-3); border-radius: 12px;">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelEditSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">Cancel</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">Update</button>
                </div>
            </form>
        `});f(m,`#cancelEditSettleBtn`).onclick=()=>v(),f(m,`#editSettlementForm`).onsubmit=e=>{e.preventDefault();let r=f(m,`#editSettleFrom`).value,i=f(m,`#editSettleTo`).value,a=parseFloat(f(m,`#editSettleAmount`).value),o=f(m,`#editSettleDate`).value;if(r===i){_(b(`settlement.toastSenderEqualsReceiver`));return}t.who=r,t.splits={[i]:100},t.value=a,t.currency=p,t.euroValue=u(a,p,`EUR`),t.date=o,t.label=`Settlement: ${r} → ${i}`,g(n.STATE_CHANGED),v()}}var U=t();function W(){let e=S(e=>e.trips),t=S(e=>e.activeTripId),r=S(e=>e.expenses),[i,a]=(0,w.useState)(`trip`),[o,c]=(0,w.useState)(()=>t||(e.length>0?e[0].id:null));(0,w.useEffect)(()=>{t&&t!==o&&c(t)},[t,o]),(0,w.useEffect)(()=>{if(o&&!e.find(e=>e.id===o)){let t=e.length>0?e[0].id:null;c(t),t&&(s.activeTripId=t,g(n.STATE_CHANGED))}},[e,o]);let l=e=>{c(e),s.activeTripId=e,g(n.STATE_CHANGED),i===`global`&&a(`trip`)},{trip:u,canEditExpenses:d}=C(o),f=(0,w.useMemo)(()=>j(u,d,i,o),[u,d,i,o,r]),p=(0,w.useRef)(null),m=e=>{let t=e.target;if(!t)return;let n=t.closest(`.settlement-trip-pill`);if(n?.dataset.tripId){l(n.dataset.tripId);return}let r=t.closest(`.settle-tab`);if(r?.dataset.tab){a(r.dataset.tab);return}let i=t.closest(`.settle-debt-btn`);if(i?.dataset.tripId&&i.dataset.from&&i.dataset.to&&i.dataset.amount&&!i.disabled){i.disabled=!0,i.textContent=b(`settlement.recordingBtn`),R(i.dataset.tripId,i.dataset.from,i.dataset.to,parseFloat(i.dataset.amount),`EUR`);return}let o=t.closest(`.open-manual-settle-btn`);if(o?.dataset.tripId){V(o.dataset.tripId);return}let s=t.closest(`.edit-settlement-btn`);if(s?.dataset.settlementId){H(s.dataset.settlementId);return}let c=t.closest(`.unsettle-settlement-btn`);if(c?.dataset.settlementId){let e=c.dataset.source===`settlement`?`settlement`:`expense`;z(c.dataset.settlementId,e);return}},h=(0,w.useRef)(l);return h.current=l,(0,w.useEffect)(()=>{let e=p.current;if(!e)return;let t=e=>{let t=e.target;if(t?.id===`settlementTripSelect`){let e=t;e.value&&h.current(e.value)}};return e.addEventListener(`change`,t),()=>e.removeEventListener(`change`,t)},[]),(0,U.jsx)(`div`,{ref:p,onClick:m,dangerouslySetInnerHTML:{__html:f}})}function G(e){y(e,(0,w.createElement)(W))}export{G as mountSettlement};
//# sourceMappingURL=mount-C9jGJJFl.js.map