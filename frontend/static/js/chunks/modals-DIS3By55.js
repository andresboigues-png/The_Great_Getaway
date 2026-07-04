import{$t as e,Cn as t,Dn as n,G as r,M as i,Mn as a,P as o,Q as s,S as c,Xt as l,Zt as u,_n as d,an as f,c as p,cn as m,et as h,gn as g,i as _,kn as v,n as y,nn as b,r as x,sn as S,wn as C,xt as w}from"../app.bundle.js";import"./share-EqE_XTfn.js";import"./trip-BTOEuO3o.js";import"./tripExport-kFH7y_rz.js";import{r as T}from"./balances-BVQTviIy.js";var E=i=>{let f=t.trips.find(e=>e.id===i);if(!f)return;if(!p(f)){D(i);return}Array.isArray(f.companions)||(f.companions=[]);let w=t.user?.id,E=new Set(t.expenses.filter(e=>e.tripId===i).flatMap(e=>[e.who,...Object.keys(e.splits||{})]).filter(Boolean).map(e=>String(e).toLocaleLowerCase())),O=new Map((f.members||[]).map(e=>[e.userId,e])),k=[],A=e=>e===`planner`?c(`companions.rolePlanner`):e===`budgeteer`?c(`companions.roleBudgeteer`):e===`relaxer`?c(`companions.roleRelaxer`):e,j=t=>{let n=E.has(t.name.toLocaleLowerCase()),r=t.linkedUserId,i=!!r&&r===w,a=r?O.get(r):null,o=``;o=i?`<span class="companion-link-pill companion-link-pill--linked" title="${b(c(`companions.pillYouText`))}">${b(c(`companions.pillYouText`))}</span>`:a?`<span class="companion-link-pill companion-link-pill--linked" title="${b(c(`companions.pillLinkedTitle`))}">${b(A(a.role))}</span>`:r?`<span class="companion-link-pill companion-link-pill--pending" title="${b(c(`companions.pillPendingTitle`))}">${b(c(`companions.pillPendingText`))}</span>`:`<span class="companion-link-pill companion-link-pill--companion">${b(c(`companions.pillUnlinkedText`))}</span>`;let s=``;r?i&&(s=`<button type="button" class="btn-link-action picker-unlink-btn" data-name="${b(t.name)}">${b(c(`companions.rowUnlinkBtn`))}</button>`):s=`<button type="button" class="btn-link-action picker-link-btn" data-name="${b(t.name)}">${b(c(`companions.rowLinkBtn`))}</button>`;let l=n?`<span class="companion-row__lock" title="${b(c(`companions.rowLockTitle`))}" style="display:inline-flex; align-items:center;">${e(`lock`,{size:14})}</span>`:`<button type="button" class="btn-x-bare picker-remove-btn" data-name="${b(t.name)}" title="${b(c(`companions.rowRemoveTitle`))}">✕</button>`;return`
            <div class="companion-row" data-name="${b(t.name)}">
                <span class="companion-row__name">${b(t.name)}</span>
                ${o}
                <span style="flex:1;"></span>
                ${s}
                ${l}
            </div>
        `},M=()=>{let e=f.companions||[];return e.length===0?`<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-6); margin: 0;">
                ${b(c(`companions.pickerEmpty`))}
            </p>`:e.map(j).join(``)},{root:N,close:P}=u({variant:`glass-light`,cardStyle:`width: min(520px, calc(100vw - 24px)); max-width: 100%; max-height: 85vh; display: flex; flex-direction: column;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${b(c(`companions.pickerTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                ${c(`companions.pickerIntro`,{trip:b(f.name)})}
            </p>

            <div id="companionPickerList" style="display: flex; flex-direction: column; gap: var(--space-2); overflow-y: auto; padding: var(--space-1); margin-bottom: var(--space-4); flex: 1; min-height: 0;">
                ${M()}
            </div>

            <!-- Add affordances: friend picker + inline plain-name input.
                 Both write to trip.companions immediately and re-render the
                 list, so what the user sees IS the saved state. -->
            <div class="companion-picker-add-section">
                <button type="button" id="companionPickerAddFriendBtn" class="companion-picker-add-section__friend-btn">
                    <span style="display:inline-flex; align-items:center;">${e(`user`,{size:16})}</span>
                    <span>${b(c(`companions.addFriendBtn`))}</span>
                </button>
                <form id="companionPickerAddForm" class="companion-picker-add-form" style="margin-bottom: 0;">
                    <input type="text" id="companionPickerAddInput" class="companion-picker-add-form__input" placeholder="${b(c(`companions.addInputPlaceholder`))}" autocomplete="off">
                    <button type="submit" class="companion-picker-add-form__btn">${b(c(`companions.addBtn`))}</button>
                </form>
            </div>

            <!-- Friend picker (hidden by default) — appears when "Add a
                 friend" is clicked, listing accepted friends not already
                 on this trip. Pick one + role → adds to trip + invites. -->
            <div id="companionPickerFriendSheet" class="companion-picker-friend-sheet" hidden>
                <div class="companion-picker-friend-sheet__header">
                    <strong id="companionPickerFriendSheetTitle">${b(c(`companions.friendSheetTitle`))}</strong>
                    <button type="button" id="companionPickerFriendCancel" class="btn-x-bare" title="${b(c(`companions.rowCloseTitle`))}">✕</button>
                </div>
                <div id="companionPickerFriendList" class="companion-picker-friend-sheet__list">
                    <p style="text-align:center; color: rgba(0,0,0,0.45); padding: var(--space-4); margin: 0;">${b(c(`companions.friendSheetLoading`))}</p>
                </div>
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="companionPickerCloseBtn" class="btn-primary" style="flex: 1; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">${b(c(`companions.doneBtn`))}</button>
            </div>
        `}),F=S(N,`#companionPickerList`),I=S(N,`#companionPickerFriendSheet`),L=S(N,`#companionPickerFriendList`),R=S(N,`#companionPickerFriendSheetTitle`),z=S(N,`#companionPickerAddInput`),B=()=>{F.innerHTML=M()},V=()=>{let e=I.dataset.linkTargetName,n=new Set((f.companions||[]).map(e=>e.linkedUserId).filter(Boolean)),r=k.filter(e=>e.id!==w&&!n.has(e.id)),i=e&&w?`
            <div class="companion-row friend-pick-row picker-self-row">
                ${t.user?.picture?`<img src="${b(t.user.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">`:``}
                <span class="companion-row__name">${b(t.user?.name||c(`companions.pillYouText`))}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${b(c(`companions.pillYouText`))}</span>
                <button type="button" class="btn-link-action picker-link-self-btn">${b(c(`companions.linkMeBtn`))}</button>
            </div>`:``;if(r.length===0&&!i){L.innerHTML=`<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-4); margin: 0;">
                ${b(c(`companions.friendSheetEmpty`))}
            </p>`;return}L.innerHTML=i+r.map(e=>`
            <div class="companion-row friend-pick-row picker-friend-row" data-friend-id="${b(e.id)}" data-friend-name="${b(e.name)}">
                <img src="${b(e.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">
                <span class="companion-row__name">${b(e.name)}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${b(e.email)}</span>
                <select class="companion-row__role-select picker-friend-role-select">
                    <option value="${_}" selected>${b(c(`companions.roleRelaxer`))}</option>
                    <option value="${y}">${b(c(`companions.roleBudgeteer`))}</option>
                    <option value="${x}">${b(c(`companions.rolePlanner`))}</option>
                </select>
                <button type="button" class="btn-link-action picker-friend-add-btn">${b(c(`companions.friendAddBtn`))}</button>
            </div>
        `).join(``)};S(N,`#companionPickerCloseBtn`).onclick=()=>{P(),C(`state:changed`)},S(N,`#companionPickerFriendCancel`).onclick=()=>{I.hidden=!0},S(N,`#companionPickerAddFriendBtn`).onclick=async()=>{delete I.dataset.linkTargetName,R&&(R.textContent=c(`companions.friendSheetTitle`)),I.hidden=!1,k.length===0&&(k=await r()),V()},S(N,`#companionPickerAddForm`).onsubmit=e=>{e.preventDefault();let t=z.value.trim();if(t){if(v(f,t)){z.value=``,z.focus();return}n(f,t),C(`state:changed`),o(f),z.value=``,B()}},N.addEventListener(`click`,e=>{(async()=>{let t=e.target;if(!t)return;let i=t.closest(`.picker-remove-btn`);if(i?.dataset.name){let e=i.dataset.name,t=v(f,e);if(!t)return;let n=()=>{a(f,e),C(`state:changed`),o(f),t.linkedUserId&&h(f.id,t.linkedUserId),B()},{balances:r}=T(f),s=r[e]??0;if(Math.abs(s)>.01){let t=d();l({title:c(`companions.removeWithBalanceTitle`),message:s>0?c(`companions.removeWithBalanceOwed`,{name:e,amount:g(s,t)}):c(`companions.removeWithBalanceOwes`,{name:e,amount:g(Math.abs(s),t)}),confirmText:c(`common.remove`),onConfirm:n})}else t.linkedUserId?l({title:c(`companions.removeConfirmTitle`),message:c(`companions.removeConfirmBody`,{name:e}),confirmText:c(`common.remove`),onConfirm:n}):n();return}let u=t.closest(`.picker-unlink-btn`);if(u?.dataset.name){let e=v(f,u.dataset.name);e&&delete e.linkedUserId,C(`state:changed`),o(f),B();return}let p=t.closest(`.picker-link-btn`);if(p?.dataset.name){I.hidden=!1,I.dataset.linkTargetName=p.dataset.name,R&&(R.textContent=c(`companions.linkSheetTitle`)),k.length===0&&(k=await r()),V();return}if(t.closest(`.picker-link-self-btn`)){let e=I.dataset.linkTargetName;if(e&&w){let t=v(f,e);t&&(t.linkedUserId=w),delete I.dataset.linkTargetName,C(`state:changed`),o(f),I.hidden=!0,B()}return}let _=t.closest(`.picker-friend-add-btn`);if(_){let e=_.closest(`.picker-friend-row`);if(!e?.dataset.friendId)return;let t=e.dataset.friendId,r=e.dataset.friendName||`Friend`,i=e.querySelector(`.picker-friend-role-select`)?.value||`relaxer`,a=await s(f.id,t,i);if(!a.ok){m(a.status===409?c(`companions.inviteRoleConflict`,{name:r}):a.status===404?c(`companions.inviteUnavailable`,{name:r}):c(`companions.inviteFailed`,{name:r}));return}let l=I.dataset.linkTargetName;if(l){let e=v(f,l);e&&(e.linkedUserId=t),delete I.dataset.linkTargetName}else{let e=v(f,r);e&&!e.linkedUserId?e.linkedUserId=t:n(f,r,t)}C(`state:changed`),o(f),I.hidden=!0,B(),m(c(`companions.invitedToast`,{name:r,role:A(i)}),`success`)}})()})},D=e=>{let n=t.trips.find(t=>t.id===e);if(!n)return;let r=n.members||[],i=r.find(e=>e.userId===n.ownerId),a=r.filter(e=>e.userId!==n.ownerId),o=e=>e===`planner`?c(`companions.rolePlanner`):e===`budgeteer`?c(`companions.roleBudgeteer`):e===`relaxer`?c(`companions.roleRelaxer`):e,s=(e,t)=>`
        <div class="companion-row" style="cursor: default;">
            ${e.picture?`<img src="${b(e.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">`:``}
            <span class="companion-row__name">${b(e.name||e.userId)}</span>
            <span class="companion-link-pill ${t?`companion-link-pill--linked`:`companion-link-pill--pending`}">
                ${b(t?c(`companions.membersOwnerBadge`):o(e.role))}
            </span>
        </div>
    `,{root:l,close:d}=u({variant:`glass-light`,cardStyle:`width: min(460px, calc(100vw - 24px)); max-width: 100%; max-height: 85vh; display: flex; flex-direction: column;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${b(c(`companions.membersTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                ${c(`companions.membersIntro`,{trip:b(n.name),role:b(o(n.myRole||`relaxer`))})}
            </p>

            <div style="display: flex; flex-direction: column; gap: var(--space-2); overflow-y: auto; padding: var(--space-1); margin-bottom: var(--space-5); flex: 1; min-height: 0;">
                ${i?s(i,!0):``}
                ${a.map(e=>s(e,!1)).join(``)}
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="tripMembersCloseBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">${b(c(`companions.closeBtn`))}</button>
            </div>
        `});S(l,`#tripMembersCloseBtn`).onclick=()=>d()},O=()=>{if(!t.activeTripId){m(c(`modals.addDayErrorNoTrip`));return}let e=(t.tripDays||[]).filter(e=>e.tripId===t.activeTripId).sort((e,t)=>e.dayNumber-t.dayNumber),n=e.filter(e=>e.dayNumber>0),r=(n.length>0?n[n.length-1].dayNumber:0)+1,a=``;if(e.length>0){let t=e[e.length-1];if(t.date){let e=new Date(t.date+`T00:00:00Z`);e.setUTCDate(e.getUTCDate()+1),a=e.toISOString().split(`T`)[0]??``}}let{root:o,close:s}=u({variant:`glass-light`,cardStyle:`width: 400px;`,innerHTML:`
            <div style="display: flex; align-items: center; justify-content: center; gap: var(--space-3); margin-bottom: var(--space-5);">
                <div style="background: var(--accent-blue); color: white; width: 28px; height: 28px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: var(--font-base);">${r}</div>
                <h2 class="card-title" style="font-size: var(--font-3xl); margin: 0; color: #000000; letter-spacing: -0.06em; font-weight: 800; text-align: center;">${b(c(`modals.addDayTitle`))}</h2>
            </div>
            <form id="addDayForm" style="display: flex; flex-direction: column; width: 100%;">
                <div class="mb-4">
                    <label class="form-label text-black/50" for="dayName">${b(c(`modals.addDayLabelWhere`))}</label>
                    <input type="text" id="dayName" class="glass-input-modal mdl-btn-dark" value="${b(c(`tripMedia.dayBucketDay`,{n:r}))}" placeholder="${b(c(`modals.addDayPlaceholderWhere`))}" required autofocus>
                </div>
                <div style="margin-bottom: var(--space-6);">
                    <label class="form-label text-black/50" for="dayDate">${b(c(`modals.addDayLabelDate`))} ${a?b(c(`modals.addDayDateAuto`)):``}</label>
                    <input type="date" id="dayDate" class="glass-input-modal mdl-btn-dark" value="${a}" required>
                </div>
                <div style="display: flex; gap: var(--space-2); width: 100%;">
                    <button type="submit" class="btn-primary flex-[2]">${b(c(`modals.addDayConfirmBtn`))}</button>
                    <button type="button" id="cancelDayBtn" class="btn-ghost" style="flex: 1; background: rgba(0,0,0,0.05); color: #000; border: none;">${b(c(`modals.addDayCancelBtn`))}</button>
                </div>
            </form>
        `}),l=t.activeTripId;S(o,`#cancelDayBtn`).onclick=()=>s(),S(o,`#addDayForm`).onsubmit=async e=>{e.preventDefault();let n={id:f(),tripId:l,name:S(o,`#dayName`).value,date:S(o,`#dayDate`).value,dayNumber:r,photos:[],notes:``,plan:{morning:``,afternoon:``,evening:``}};t.tripDays.push(n),C(`state:changed`);let a=await i(n);if(a&&!a.ok){let e=a.status||`no-response`,t=a.body?.error||``;m(c(`modals.addDayErrorServerSave`,{status:t?`${e} · ${t}`:String(e)})),console.error(`[upsertDay] failed`,{dayId:n.id,status:e,body:a.body})}s(),w(`home`)}};export{E as n,D as r,O as t};
//# sourceMappingURL=modals-DIS3By55.js.map