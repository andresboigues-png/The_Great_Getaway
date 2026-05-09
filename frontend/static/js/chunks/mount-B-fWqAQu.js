import{r as e,t}from"./vendor-react-CYVQMBjw.js";import{$ as n,B as r,G as i,H as a,I as o,J as s,K as c,R as l,U as u,W as d,X as f,Z as p,q as m,tt as h,y as g}from"../app.bundle.js";import{t as _}from"./store-DjTHmPzH.js";var v=e();function y(e){if(!e)return{balances:{},roster:[],expenses:[]};let t=(f.expenses||[]).filter(t=>t.tripId===e.id),r=n(e),i=r.length>0?r:Array.from(new Set(t.flatMap(e=>[e.who,...Object.keys(e.splits||{})]).filter(Boolean))),a={};i.forEach(e=>a[e]=0);for(let e of t){let t=e.euroValue||e.value||0;if(a[e.who]!==void 0&&(a[e.who]+=t),e.splits&&Object.keys(e.splits).length>0)for(let[n,r]of Object.entries(e.splits))a[n]!==void 0&&(a[n]-=t*(Number(r)/100));else{let e=t/Math.max(i.length,1);i.forEach(t=>{a[t]!==void 0&&(a[t]-=e)})}}return{balances:a,roster:i,expenses:t}}function b(e){let t=[],n=[];for(let[r,i]of Object.entries(e))i>.01?t.push({person:r,amount:i}):i<-.01&&n.push({person:r,amount:Math.abs(i)});t.sort((e,t)=>t.amount-e.amount),n.sort((e,t)=>t.amount-e.amount);let r=[],i=0,a=0;for(;i<n.length&&a<t.length;){let e=n[i],o=t[a],s=Math.min(e.amount,o.amount);r.push({from:e.person,to:o.person,amount:s}),e.amount-=s,o.amount-=s,e.amount<.01&&i++,o.amount<.01&&a++}return r}function x(){let e={};for(let t of[...f.trips,...f.archivedTrips||[]])for(let r of n(t))r in e||(e[r]=0);let t=(f.archivedTrips||[]).flatMap(e=>e.expenses||[]),r=[...f.expenses,...t],i={};for(let e of[...f.trips,...f.archivedTrips||[]])i[e.id]=n(e);for(let t of r){let n=t.euroValue||t.value||0;if(e[t.who]!==void 0&&(e[t.who]+=n),t.splits&&Object.keys(t.splits).length>0)for(let[r,i]of Object.entries(t.splits))e[r]!==void 0&&(e[r]-=n*(Number(i)/100));else{let r=i[t.tripId]||[],a=r.length>0?r:Array.from(new Set([t.who,...Object.keys(t.splits||{})].filter(Boolean))),o=n/Math.max(a.length,1);a.forEach(t=>{e[t]!==void 0&&(e[t]-=o)})}}return e}function S(e){if(!e)return[];let t=(f.expenses||[]).filter(t=>t.tripId===e.id),r=n(e),i={};r.forEach(e=>i[e]={paid:0,share:0});for(let e of t){let t=e.euroValue||e.value||0;if(i[e.who]&&(i[e.who].paid+=t),e.splits&&Object.keys(e.splits).length>0)for(let[n,r]of Object.entries(e.splits))i[n]&&(i[n].share+=t*(Number(r)/100));else{let e=t/Math.max(r.length,1);r.forEach(t=>{i[t]&&(i[t].share+=e)})}}return Object.entries(i).map(([e,t])=>({name:e,paid:t.paid,share:t.share,net:t.paid-t.share}))}function C(e,t,n,r){let i=`
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #ffd60a; --g-to: #ff9f0a;">Settlements</h1>
            <p>Calculate who owes what and settle up fairly.</p>
        </div>
        ${w(r)}
    `;return e?`
        ${i}
        ${T(e,n)}
        ${n===`trip`?E(e,t):``}
        ${n===`history`?D(e,t):``}
        ${n===`global`?O():``}
    `:`
            ${i}
            <div class="card glass" style="text-align: center; padding: 60px 32px; margin-top: 24px; border-radius: 28px;">
                <div style="font-size: 4rem; margin-bottom: 12px;">⚖️</div>
                <h2 style="margin:0 0 6px;">No trips yet</h2>
                <p class="text-muted">Create a trip and add expenses to see settlement calculations.</p>
            </div>
        `}function w(e){return f.trips.length===0?``:`
        <div style="margin-top: 22px; margin-bottom: 12px;">
            <div style="display:flex; gap:12px; overflow-x:auto; padding: 6px 2px 28px; scroll-behavior:smooth; -webkit-overflow-scrolling:touch;">
                ${f.trips.map(t=>{let n=(f.expenses||[]).filter(e=>e.tripId===t.id&&e.isSettlement).reduce((e,t)=>e+(t.euroValue||0),0),i=t.id===e;return`
                            <button type="button" class="settlement-trip-pill${i?` is-active`:``}" data-trip-id="${r(t.id)}"
                                style="flex-shrink:0; min-width: 200px; text-align:left; background: ${i?`linear-gradient(135deg, rgba(255,214,10,0.16), rgba(255,159,10,0.08))`:`white`}; border: 1.5px solid ${i?`rgba(255,159,10,0.55)`:`rgba(0,0,0,0.06)`}; border-radius: 18px; padding: 14px 16px; cursor:pointer; box-shadow: ${i?`0 8px 24px rgba(255,159,10,0.22)`:`0 4px 12px rgba(0,45,91,0.06)`}; display:flex; flex-direction:column; gap:6px; font: inherit; color: inherit; outline: 0; margin: 0; transition: transform 0.25s cubic-bezier(0.16,1,0.3,1), box-shadow 0.25s cubic-bezier(0.16,1,0.3,1);">
                                <span style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; color:${i?`#a35200`:`var(--text-secondary)`};">Trip</span>
                                <span style="font-size:1rem; font-weight:800; color:#002d5b; letter-spacing:-0.02em; line-height:1.15;">${r(t.name)}</span>
                                <span style="font-size:0.78rem; font-weight:700; color: #005bb8;">${a(n,`EUR`)} settled</span>
                            </button>
                        `}).join(``)}
            </div>
        </div>
    `}function T(e,t){let n=(f.expenses||[]).filter(t=>t.tripId===e.id&&t.isSettlement).length,r=(e,n,r)=>`
        <button class="settle-tab${t===e?` is-active`:``}" data-tab="${e}" type="button"
            style="background:none; border:0; padding:12px 4px; font-size:0.95rem; font-weight:${t===e?`800`:`600`}; color:${t===e?`#005bb8`:`var(--text-secondary)`}; cursor:pointer; border-bottom:2px solid ${t===e?`var(--accent-blue)`:`transparent`}; margin-bottom:-1px; letter-spacing:-0.01em; transition: color 0.2s, border-color 0.2s;">
            ${n}${r!==void 0&&r>0?` <span style="background:rgba(0,113,227,0.12); color:#005bb8; padding:1px 6px; border-radius:999px; font-size:0.7rem; font-weight:800; margin-left:2px;">${r}</span>`:``}
        </button>
    `;return`
        <nav style="display:flex; gap:36px; border-bottom: 1px solid rgba(0,113,227,0.25); margin: 22px 0 22px; padding: 0 4px;">
            ${r(`trip`,`This trip`)}
            ${r(`history`,`History`,n)}
            ${r(`global`,`Cross-trip`)}
        </nav>
    `}function E(e,t){let{balances:n}=y(e),i=b(n),o=S(e),s=o.reduce((e,t)=>e+t.paid,0),c=[...o].sort((e,t)=>t.paid-e.paid)[0],l=[...o].sort((e,t)=>e.net-t.net)[0],u=[...o].sort((e,t)=>t.net-e.net)[0],d=s>0?`
        <div class="card glass" style="margin-bottom: 18px; padding: 22px 26px; border-radius: 28px; background: linear-gradient(135deg, rgba(255,214,10,0.05), rgba(255,159,10,0.03)); border:1px solid rgba(255,159,10,0.18);">
            <div style="display:flex; flex-wrap:wrap; gap:24px; align-items:center; justify-content:space-between;">
                <div style="min-width:0;">
                    <div style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary); margin-bottom:6px;">Trip total</div>
                    <div style="font-size:2rem; font-weight:800; color:#002d5b; letter-spacing:-0.02em;">${a(s,`EUR`)}</div>
                </div>
                ${c?`
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">💸 Top payer</div>
                        <div style="font-size:1.1rem; font-weight:800; color:#002d5b; margin-top:4px;">${r(c.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:var(--text-secondary);">${a(c.paid,`EUR`)}</div>
                    </div>
                `:``}
                ${u&&u.net>.01?`
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">+ Most owed</div>
                        <div style="font-size:1.1rem; font-weight:800; color:#002d5b; margin-top:4px;">${r(u.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#1a6b3c;">+${a(u.net,`EUR`)}</div>
                    </div>
                `:``}
                ${l&&l.net<-.01?`
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#ff3b30;">– Owes the most</div>
                        <div style="font-size:1.1rem; font-weight:800; color:#002d5b; margin-top:4px;">${r(l.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#a30000;">${a(l.net,`EUR`)}</div>
                    </div>
                `:``}
            </div>
        </div>
    `:``,f=Object.entries(n).map(([e,t])=>{let n=t>.01,i=t<-.01;return`
            <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:14px;">
                <div style="width:34px; height:34px; border-radius:50%; background: ${n?`rgba(52,199,89,0.12)`:i?`rgba(255,59,48,0.1)`:`rgba(0,0,0,0.04)`}; color: ${n?`#1a6b3c`:i?`#a30000`:`rgba(0,0,0,0.5)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                    ${r(e.charAt(0).toUpperCase())}
                </div>
                <div style="flex:1; min-width:0; font-weight:800; color:#002d5b; font-size:0.95rem; overflow:hidden; text-overflow:ellipsis;">${r(e)}</div>
                <div style="font-weight:800; color: ${n?`#1a6b3c`:i?`#a30000`:`var(--text-secondary)`}; font-size:1rem;">
                    ${n?`+`:``}${a(t,`EUR`)}
                </div>
            </div>
        `}).join(``)||`<p class="text-muted" style="padding: 20px; text-align:center;">No companions on this trip yet.</p>`,p=i.length===0?`<div style="text-align:center; padding: 40px 20px;"><div style="font-size:2.2rem; margin-bottom:8px;">🥂</div><p style="margin:0; font-weight:800; color:#1a6b3c;">All settled for this trip!</p><p style="margin:6px 0 0; color:var(--text-secondary); font-size:0.85rem;">Every balance is square.</p></div>`:i.map(n=>`
            <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:16px;">
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${r(n.from)}</span>
                        <span style="color:rgba(0,0,0,0.3);">→</span>
                        <span style="font-weight:800; color:#002d5b; font-size:0.95rem;">${r(n.to)}</span>
                    </div>
                    <div style="font-size:1.3rem; font-weight:800; color:#002d5b; letter-spacing:-0.01em; margin-top:2px;">${a(n.amount,`EUR`)}</div>
                </div>
                ${t?`
                    <button class="btn-primary settle-debt-btn" data-trip-id="${r(e.id)}" data-from="${r(n.from)}" data-to="${r(n.to)}" data-amount="${n.amount}"
                        style="padding: 8px 18px; font-size:0.85rem; border-radius: 999px; flex-shrink:0;">Settle</button>
                `:``}
            </div>
        `).join(``);return`
        ${d}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:18px; margin-bottom:24px;">
            <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                    <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">Trip balances</h3>
                    <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${Object.keys(n).length} ${Object.keys(n).length===1?`person`:`people`}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    ${f}
                </div>
            </div>
            <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
                    <div style="min-width:0;">
                        <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">Suggested payments</h3>
                        <div style="font-size:0.7rem; font-weight:700; color:var(--text-secondary); margin-top:3px;">For this trip only — see Cross-trip for everyone-everywhere.</div>
                    </div>
                    <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em; flex-shrink:0;">${i.length} ${i.length===1?`payment`:`payments`}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${p}
                </div>
            </div>
        </div>
        ${t?`
            <div style="text-align:center; margin-bottom: 24px;">
                <button class="btn-ghost open-manual-settle-btn" data-trip-id="${r(e.id)}" type="button"
                    style="background: white; border:1px solid rgba(0,0,0,0.08); color:#002d5b; padding: 10px 24px; border-radius: 999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow: 0 4px 12px rgba(0,45,91,0.05);">
                    + Manual settlement
                </button>
            </div>
        `:``}
    `}function D(e,t){let n=(f.expenses||[]).filter(t=>t.tripId===e.id&&t.isSettlement).sort((e,t)=>new Date(t.date).getTime()-new Date(e.date).getTime());if(n.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">📜</div>
                <h2 style="margin:0 0 6px; color:#002d5b;">No past settlements yet</h2>
                <p class="text-muted" style="margin:0;">Once payments are recorded between companions, they show up here as a timeline.</p>
            </div>
        `;let i={};for(let e of n){let t=e.date||`undated`;i[t]||(i[t]=[]),i[t].push(e)}let o=new Date().toISOString().slice(0,10),s=new Date;s.setDate(s.getDate()-1);let c=s.toISOString().slice(0,10),l=e=>{if(e===`undated`)return`No date`;if(e===o)return`Today`;if(e===c)return`Yesterday`;let t=new Date(e);return isNaN(t.getTime())?e:t.toLocaleDateString(void 0,{weekday:`short`,month:`short`,day:`numeric`,year:`numeric`})},u=Object.keys(i).sort((e,t)=>e===`undated`?1:t===`undated`?-1:t.localeCompare(e));return`
        <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">Past settlements</h3>
                <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${n.length} recorded</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:18px;">
                ${u.map(n=>{let o=i[n],s=o.reduce((e,t)=>e+(t.euroValue||0),0);return`
                        <div>
                            <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:8px; padding: 0 4px;">
                                <h4 style="margin:0; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary);">${r(l(n))}</h4>
                                <span style="font-size:0.72rem; font-weight:700; color:var(--text-secondary);">${a(s,`EUR`)} · ${o.length} ${o.length===1?`settlement`:`settlements`}</span>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                ${o.map(n=>{let i=Object.keys(n.splits||{})[0]||`?`;return`
                                        <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:14px;">
                                            <div style="width:34px; height:34px; border-radius:50%; background:rgba(52,199,89,0.12); color:#1a6b3c; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">${r((n.who||`?`).charAt(0).toUpperCase())}</div>
                                            <div style="flex:1; min-width:0;">
                                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                                    <span style="font-weight:800; color:#002d5b; font-size:0.95rem;">${r(n.who)}</span>
                                                    <span style="color:rgba(0,0,0,0.3); font-weight:600;">→</span>
                                                    <span style="font-weight:800; color:#002d5b; font-size:0.95rem;">${r(i)}</span>
                                                    <span style="display:inline-flex; align-items:center; gap:3px; background:rgba(52,199,89,0.12); color:#1a6b3c; padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">✓ Settled</span>
                                                </div>
                                            </div>
                                            <div style="font-size:1rem; font-weight:800; color:#1a6b3c; flex-shrink:0;">${a(n.euroValue||0,`EUR`)}</div>
                                            ${t?`
                                                <div style="display:flex; gap:6px; flex-shrink:0;">
                                                    <button class="edit-settlement-btn" data-settlement-id="${r(n.id)}" type="button"
                                                        style="background:rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.22); color:#005bb8; padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">Edit</button>
                                                    <button class="unsettle-settlement-btn" data-settlement-id="${r(n.id)}" data-trip-id="${r(e.id)}" type="button"
                                                        style="background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.22); color:#ff3b30; padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">Unsettle</button>
                                                </div>
                                            `:``}
                                        </div>
                                    `}).join(``)}
                            </div>
                        </div>
                    `}).join(``)}
            </div>
        </div>
    `}function O(){let e=x(),t=Object.entries(e).sort((e,t)=>t[1]-e[1]),n=Math.max(...Object.values(e).map(Math.abs),1),i=t.some(([,e])=>Math.abs(e)>.01);if(t.length===0)return`
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">🌍</div>
                <h2 style="margin:0 0 6px; color:#002d5b;">No companions yet</h2>
                <p class="text-muted" style="margin:0;">Add companions to a trip and log expenses to see cross-trip balances.</p>
            </div>
        `;let o=b(e);return`
        <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">🌍 Cross-trip balances</h3>
                <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">Across all trips · active + completed</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
                ${t.map(([e,t])=>{let o=i?Math.min(Math.abs(t)/n*100,100):0,s=t>.01,c=t<-.01,l=s?`#1a6b3c`:c?`#a30000`:`var(--text-secondary)`;return`
                        <div style="display:flex; flex-direction:column; gap:10px; padding:12px 14px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:14px;">
                            <div style="display:flex; align-items:center; gap:14px;">
                                <div style="width:34px; height:34px; border-radius:50%; background: ${s?`rgba(52,199,89,0.12)`:c?`rgba(255,59,48,0.1)`:`rgba(0,0,0,0.04)`}; color: ${s?`#1a6b3c`:c?`#a30000`:`rgba(0,0,0,0.5)`}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                                    ${r(e.charAt(0).toUpperCase())}
                                </div>
                                <div style="flex:1; min-width:0; font-weight:800; color:#002d5b; font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${r(e)}</div>
                                <div style="font-weight:800; color: ${l}; font-size:1rem;">
                                    ${s?`+`:``}${a(t,`EUR`)}
                                </div>
                            </div>
                            ${i?`
                                <div style="height:6px; background: rgba(0,0,0,0.05); border-radius:999px; overflow:hidden; position:relative;">
                                    ${s?`<div style="position:absolute; left:50%; top:0; bottom:0; width:${o/2}%; background:#34c759; border-radius:999px;"></div>`:``}
                                    ${c?`<div style="position:absolute; right:50%; top:0; bottom:0; width:${o/2}%; background:#ff3b30; border-radius:999px;"></div>`:``}
                                    <div style="position:absolute; left:50%; top:-2px; bottom:-2px; width:1px; background: rgba(0,0,0,0.12);"></div>
                                </div>
                            `:``}
                        </div>
                    `}).join(``)}
            </div>
        </div>
        ${o.length>0?`
            <div class="card glass" style="margin-top:18px; padding: 22px 24px; border-radius: 28px;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
                    <div style="min-width:0;">
                        <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">Suggested cross-trip payments</h3>
                        <div style="font-size:0.7rem; font-weight:700; color:var(--text-secondary); margin-top:3px;">Fewest payments to clear everyone across every trip you share. Record the actual settlement on whichever trip's tab fits.</div>
                    </div>
                    <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em; flex-shrink:0;">${o.length} ${o.length===1?`payment`:`payments`}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${o.map(e=>`
                        <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:16px;">
                            <div style="flex:1; min-width:0;">
                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                    <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${r(e.from)}</span>
                                    <span style="color:rgba(0,0,0,0.3);">→</span>
                                    <span style="font-weight:800; color:#002d5b; font-size:0.95rem;">${r(e.to)}</span>
                                </div>
                                <div style="font-size:1.3rem; font-weight:800; color:#002d5b; letter-spacing:-0.01em; margin-top:2px;">${a(e.amount,`EUR`)}</div>
                            </div>
                        </div>
                    `).join(``)}
                </div>
            </div>
        `:``}
    `}function k(e,t,n,r,i){if(t===n){m(`Sender and receiver must be different.`);return}if(!Number.isFinite(r)||r<=0){m(`Amount must be a positive number.`);return}let o=l(r,i,`EUR`),s={id:u(),tripId:e,label:`Settlement: ${t} → ${n}`,value:r,euroValue:o,currency:i,who:t,categoryId:f.categories[0]?.id??``,country:`Settlement`,date:new Date().toISOString().split(`T`)[0]??``,splits:{[n]:100},isSettlement:!0};f.expenses.push(s),p(h.STATE_CHANGED),m(`Recorded ${a(o,`EUR`)} ${t} → ${n}`)}function A(e){c({title:`Unsettle this payment?`,message:`The settlement record is removed and balances revert.`,confirmText:`Unsettle`,onConfirm:()=>{f.expenses=f.expenses.filter(t=>t.id!==e),p(h.STATE_CHANGED)}})}function j(e){let t=n(f.trips.find(t=>t.id===e)).map(e=>`<option value="${r(e)}">${r(e)}</option>`).join(``),a=d(),{root:o,close:c}=s({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">Manual settlement</h2>
            <p class="text-subtitle">Record a payment that already happened off-app.</p>
            <form id="manualSettleForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">From</label>
                <select id="manualSettleFrom" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">${t}</select>
                <label class="form-label" style="margin-top:6px;">To</label>
                <select id="manualSettleTo" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">${t}</select>
                <label class="form-label" style="margin-top:6px;">Amount (${r(a)})</label>
                <input type="number" step="0.01" min="0.01" id="manualSettleAmount" class="glass-input" placeholder="0.00" required style="padding: var(--space-3); border-radius: 12px;">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelManualSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">Cancel</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">Record payment</button>
                </div>
            </form>
        `});i(o,`#cancelManualSettleBtn`).onclick=()=>c(),i(o,`#manualSettleForm`).onsubmit=t=>{t.preventDefault();let n=i(o,`#manualSettleFrom`).value,r=i(o,`#manualSettleTo`).value,s=parseFloat(i(o,`#manualSettleAmount`).value);if(n===r){m(`Sender and receiver must be different.`);return}k(e,n,r,s,a),c()}}function M(e){let t=f.expenses.find(t=>t.id===e);if(!t)return;let a=n(f.trips.find(e=>e.id===t.tripId)),o=a.map(e=>`<option value="${r(e)}" ${t.who===e?`selected`:``}>${r(e)}</option>`).join(``),c=Object.keys(t.splits||{})[0],u=a.map(e=>`<option value="${r(e)}" ${c===e?`selected`:``}>${r(e)}</option>`).join(``),g=d(),{root:_,close:v}=s({variant:`glass-light`,cardStyle:`width: 440px; max-width: calc(100vw - 32px);`,innerHTML:`
            <h2 class="h2-display">Edit settlement</h2>
            <form id="editSettlementForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">From</label>
                <select id="editSettleFrom" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">${o}</select>
                <label class="form-label" style="margin-top:6px;">To</label>
                <select id="editSettleTo" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">${u}</select>
                <label class="form-label" style="margin-top:6px;">Amount (${r(g)})</label>
                <input type="number" step="0.01" min="0.01" id="editSettleAmount" value="${l(t.euroValue||0,`EUR`,g).toFixed(2)}" class="glass-input" required style="padding: var(--space-3); border-radius: 12px;">
                <label class="form-label" style="margin-top:6px;">Date</label>
                <input type="date" id="editSettleDate" value="${r(t.date||``)}" class="glass-input" required style="padding: var(--space-3); border-radius: 12px;">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelEditSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">Cancel</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">Update</button>
                </div>
            </form>
        `});i(_,`#cancelEditSettleBtn`).onclick=()=>v(),i(_,`#editSettlementForm`).onsubmit=e=>{e.preventDefault();let n=i(_,`#editSettleFrom`).value,r=i(_,`#editSettleTo`).value,a=parseFloat(i(_,`#editSettleAmount`).value),o=i(_,`#editSettleDate`).value;if(n===r){m(`Sender and receiver must be different.`);return}t.who=n,t.splits={[r]:100},t.value=a,t.currency=g,t.euroValue=l(a,g,`EUR`),t.date=o,t.label=`Settlement: ${n} → ${r}`,p(h.STATE_CHANGED),v()}}var N=t();function P(){let e=_(e=>e.trips),t=_(e=>e.activeTripId);_(e=>e.expenses);let[n,r]=(0,v.useState)(`trip`),[i,a]=(0,v.useState)(()=>t||(e.length>0?e[0].id:null));(0,v.useEffect)(()=>{i&&!e.find(e=>e.id===i)&&a(t||(e.length>0?e[0].id:null))},[e,i,t]);let s=e.find(e=>e.id===i)||null,c=o(s),l=(0,v.useMemo)(()=>C(s,c,n,i),[s,c,n,i,_.length]),u=(0,v.useRef)(null);return(0,N.jsx)(`div`,{ref:u,onClick:e=>{let t=e.target;if(!t)return;let n=t.closest(`.settlement-trip-pill`);if(n?.dataset.tripId){a(n.dataset.tripId);return}let i=t.closest(`.settle-tab`);if(i?.dataset.tab){r(i.dataset.tab);return}let o=t.closest(`.settle-debt-btn`);if(o?.dataset.tripId&&o.dataset.from&&o.dataset.to&&o.dataset.amount&&!o.disabled){o.disabled=!0,o.textContent=`Recording…`,k(o.dataset.tripId,o.dataset.from,o.dataset.to,parseFloat(o.dataset.amount),`EUR`);return}let s=t.closest(`.open-manual-settle-btn`);if(s?.dataset.tripId){j(s.dataset.tripId);return}let c=t.closest(`.edit-settlement-btn`);if(c?.dataset.settlementId){M(c.dataset.settlementId);return}let l=t.closest(`.unsettle-settlement-btn`);if(l?.dataset.settlementId){A(l.dataset.settlementId);return}},dangerouslySetInnerHTML:{__html:l}})}function F(e){g(e,(0,v.createElement)(P))}export{F as mountSettlement};
//# sourceMappingURL=mount-B-fWqAQu.js.map