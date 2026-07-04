import{An as e,G as t,M as n,Nn as r,On as i,P as a,Q as o,Qt as s,S as c,Tn as l,Zt as u,_n as d,c as f,cn as p,en as m,et as h,i as g,ln as _,n as v,on as y,r as b,rn as x,vn as S,wn as C,xt as w}from"../app.bundle.js";import"./share-BHXScMGU.js";import"./trip-hVCkehP0.js";import"./tripExport-ELj66lRK.js";import{r as T}from"./balances-DALN8orj.js";var E=n=>{let y=C.trips.find(e=>e.id===n);if(!y)return;if(!f(y)){D(n);return}Array.isArray(y.companions)||(y.companions=[]);let w=C.user?.id,E=new Set(C.expenses.filter(e=>e.tripId===n).flatMap(e=>[e.who,...Object.keys(e.splits||{})]).filter(Boolean).map(e=>String(e).toLocaleLowerCase())),O=new Map((y.members||[]).map(e=>[e.userId,e])),k=[],A=e=>e===`planner`?c(`companions.rolePlanner`):e===`budgeteer`?c(`companions.roleBudgeteer`):e===`relaxer`?c(`companions.roleRelaxer`):e,j=e=>{let t=E.has(e.name.toLocaleLowerCase()),n=e.linkedUserId,r=!!n&&n===w,i=n?O.get(n):null,a=``;a=r?`<span class="companion-link-pill companion-link-pill--linked" title="${x(c(`companions.pillYouText`))}">${x(c(`companions.pillYouText`))}</span>`:i?`<span class="companion-link-pill companion-link-pill--linked" title="${x(c(`companions.pillLinkedTitle`))}">${x(A(i.role))}</span>`:n?`<span class="companion-link-pill companion-link-pill--pending" title="${x(c(`companions.pillPendingTitle`))}">${x(c(`companions.pillPendingText`))}</span>`:`<span class="companion-link-pill companion-link-pill--companion">${x(c(`companions.pillUnlinkedText`))}</span>`;let o=``;n?r&&(o=`<button type="button" class="btn-link-action picker-unlink-btn" data-name="${x(e.name)}">${x(c(`companions.rowUnlinkBtn`))}</button>`):o=`<button type="button" class="btn-link-action picker-link-btn" data-name="${x(e.name)}">${x(c(`companions.rowLinkBtn`))}</button>`;let s=t?`<span class="companion-row__lock" title="${x(c(`companions.rowLockTitle`))}" style="display:inline-flex; align-items:center;">${m(`lock`,{size:14})}</span>`:`<button type="button" class="btn-x-bare picker-remove-btn" data-name="${x(e.name)}" title="${x(c(`companions.rowRemoveTitle`))}">✕</button>`;return`
            <div class="companion-row" data-name="${x(e.name)}">
                <span class="companion-row__name">${x(e.name)}</span>
                ${a}
                <span style="flex:1;"></span>
                ${o}
                ${s}
            </div>
        `},M=()=>{let e=y.companions||[];return e.length===0?`<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-6); margin: 0;">
                ${x(c(`companions.pickerEmpty`))}
            </p>`:e.map(j).join(``)},{root:N,close:P}=s({variant:`glass-light`,cardStyle:`width: min(520px, calc(100vw - 24px)); max-width: 100%; max-height: 85vh; display: flex; flex-direction: column;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${x(c(`companions.pickerTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                ${c(`companions.pickerIntro`,{trip:x(y.name)})}
            </p>

            <div id="companionPickerList" style="display: flex; flex-direction: column; gap: var(--space-2); overflow-y: auto; padding: var(--space-1); margin-bottom: var(--space-4); flex: 1; min-height: 0;">
                ${M()}
            </div>

            <!-- Add affordances: friend picker + inline plain-name input.
                 Both write to trip.companions immediately and re-render the
                 list, so what the user sees IS the saved state. -->
            <div class="companion-picker-add-section">
                <button type="button" id="companionPickerAddFriendBtn" class="companion-picker-add-section__friend-btn">
                    <span style="display:inline-flex; align-items:center;">${m(`user`,{size:16})}</span>
                    <span>${x(c(`companions.addFriendBtn`))}</span>
                </button>
                <form id="companionPickerAddForm" class="companion-picker-add-form" style="margin-bottom: 0;">
                    <input type="text" id="companionPickerAddInput" class="companion-picker-add-form__input" placeholder="${x(c(`companions.addInputPlaceholder`))}" autocomplete="off">
                    <button type="submit" class="companion-picker-add-form__btn">${x(c(`companions.addBtn`))}</button>
                </form>
            </div>

            <!-- Friend picker (hidden by default) — appears when "Add a
                 friend" is clicked, listing accepted friends not already
                 on this trip. Pick one + role → adds to trip + invites. -->
            <div id="companionPickerFriendSheet" class="companion-picker-friend-sheet" hidden>
                <div class="companion-picker-friend-sheet__header">
                    <strong id="companionPickerFriendSheetTitle">${x(c(`companions.friendSheetTitle`))}</strong>
                    <button type="button" id="companionPickerFriendCancel" class="btn-x-bare" title="${x(c(`companions.rowCloseTitle`))}">✕</button>
                </div>
                <div id="companionPickerFriendList" class="companion-picker-friend-sheet__list">
                    <p style="text-align:center; color: rgba(0,0,0,0.45); padding: var(--space-4); margin: 0;">${x(c(`companions.friendSheetLoading`))}</p>
                </div>
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="companionPickerCloseBtn" class="btn-primary" style="flex: 1; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">${x(c(`companions.doneBtn`))}</button>
            </div>
        `}),F=p(N,`#companionPickerList`),I=p(N,`#companionPickerFriendSheet`),L=p(N,`#companionPickerFriendList`),R=p(N,`#companionPickerFriendSheetTitle`),z=p(N,`#companionPickerAddInput`),B=()=>{F.innerHTML=M()},V=()=>{let e=I.dataset.linkTargetName,t=new Set((y.companions||[]).map(e=>e.linkedUserId).filter(Boolean)),n=k.filter(e=>e.id!==w&&!t.has(e.id)),r=e&&w?`
            <div class="companion-row friend-pick-row picker-self-row">
                ${C.user?.picture?`<img src="${x(C.user.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">`:``}
                <span class="companion-row__name">${x(C.user?.name||c(`companions.pillYouText`))}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${x(c(`companions.pillYouText`))}</span>
                <button type="button" class="btn-link-action picker-link-self-btn">${x(c(`companions.linkMeBtn`))}</button>
            </div>`:``;if(n.length===0&&!r){L.innerHTML=`<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-4); margin: 0;">
                ${x(c(`companions.friendSheetEmpty`))}
            </p>`;return}L.innerHTML=r+n.map(e=>`
            <div class="companion-row friend-pick-row picker-friend-row" data-friend-id="${x(e.id)}" data-friend-name="${x(e.name)}">
                <img src="${x(e.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">
                <span class="companion-row__name">${x(e.name)}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${x(e.email)}</span>
                <select class="companion-row__role-select picker-friend-role-select">
                    <option value="${g}" selected>${x(c(`companions.roleRelaxer`))}</option>
                    <option value="${v}">${x(c(`companions.roleBudgeteer`))}</option>
                    <option value="${b}">${x(c(`companions.rolePlanner`))}</option>
                </select>
                <button type="button" class="btn-link-action picker-friend-add-btn">${x(c(`companions.friendAddBtn`))}</button>
            </div>
        `).join(``)};p(N,`#companionPickerCloseBtn`).onclick=()=>{P(),l(`state:changed`)},p(N,`#companionPickerFriendCancel`).onclick=()=>{I.hidden=!0},p(N,`#companionPickerAddFriendBtn`).onclick=async()=>{delete I.dataset.linkTargetName,R&&(R.textContent=c(`companions.friendSheetTitle`)),I.hidden=!1,k.length===0&&(k=await t()),V()},p(N,`#companionPickerAddForm`).onsubmit=t=>{t.preventDefault();let n=z.value.trim();if(n){if(e(y,n)){z.value=``,z.focus();return}i(y,n),l(`state:changed`),a(y),z.value=``,B()}},N.addEventListener(`click`,n=>{(async()=>{let s=n.target;if(!s)return;let f=s.closest(`.picker-remove-btn`);if(f?.dataset.name){let t=f.dataset.name,n=e(y,t);if(!n)return;let i=()=>{r(y,t),l(`state:changed`),a(y),n.linkedUserId&&h(y.id,n.linkedUserId),B()},{balances:o}=T(y),s=o[t]??0;if(Math.abs(s)>.01){let e=S();u({title:c(`companions.removeWithBalanceTitle`),message:s>0?c(`companions.removeWithBalanceOwed`,{name:t,amount:d(s,e)}):c(`companions.removeWithBalanceOwes`,{name:t,amount:d(Math.abs(s),e)}),confirmText:c(`common.remove`),onConfirm:i})}else n.linkedUserId?u({title:c(`companions.removeConfirmTitle`),message:c(`companions.removeConfirmBody`,{name:t}),confirmText:c(`common.remove`),onConfirm:i}):i();return}let p=s.closest(`.picker-unlink-btn`);if(p?.dataset.name){let t=e(y,p.dataset.name);t&&delete t.linkedUserId,l(`state:changed`),a(y),B();return}let m=s.closest(`.picker-link-btn`);if(m?.dataset.name){I.hidden=!1,I.dataset.linkTargetName=m.dataset.name,R&&(R.textContent=c(`companions.linkSheetTitle`)),k.length===0&&(k=await t()),V();return}if(s.closest(`.picker-link-self-btn`)){let t=I.dataset.linkTargetName;if(t&&w){let n=e(y,t);n&&(n.linkedUserId=w),delete I.dataset.linkTargetName,l(`state:changed`),a(y),I.hidden=!0,B()}return}let g=s.closest(`.picker-friend-add-btn`);if(g){let t=g.closest(`.picker-friend-row`);if(!t?.dataset.friendId)return;let n=t.dataset.friendId,r=t.dataset.friendName||`Friend`,s=t.querySelector(`.picker-friend-role-select`)?.value||`relaxer`,u=await o(y.id,n,s);if(!u.ok){_(u.status===409?c(`companions.inviteRoleConflict`,{name:r}):u.status===404?c(`companions.inviteUnavailable`,{name:r}):c(`companions.inviteFailed`,{name:r}));return}let d=I.dataset.linkTargetName;if(d){let t=e(y,d);t&&(t.linkedUserId=n),delete I.dataset.linkTargetName}else{let t=e(y,r);t&&!t.linkedUserId?t.linkedUserId=n:i(y,r,n)}l(`state:changed`),a(y),I.hidden=!0,B(),_(c(`companions.invitedToast`,{name:r,role:A(s)}),`success`)}})()})},D=e=>{let t=C.trips.find(t=>t.id===e);if(!t)return;let n=t.members||[],r=n.find(e=>e.userId===t.ownerId),i=n.filter(e=>e.userId!==t.ownerId),a=e=>e===`planner`?c(`companions.rolePlanner`):e===`budgeteer`?c(`companions.roleBudgeteer`):e===`relaxer`?c(`companions.roleRelaxer`):e,o=(e,t)=>`
        <div class="companion-row" style="cursor: default;">
            ${e.picture?`<img src="${x(e.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">`:``}
            <span class="companion-row__name">${x(e.name||e.userId)}</span>
            <span class="companion-link-pill ${t?`companion-link-pill--linked`:`companion-link-pill--pending`}">
                ${x(t?c(`companions.membersOwnerBadge`):a(e.role))}
            </span>
        </div>
    `,{root:l,close:u}=s({variant:`glass-light`,cardStyle:`width: min(460px, calc(100vw - 24px)); max-width: 100%; max-height: 85vh; display: flex; flex-direction: column;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${x(c(`companions.membersTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                ${c(`companions.membersIntro`,{trip:x(t.name),role:x(a(t.myRole||`relaxer`))})}
            </p>

            <div style="display: flex; flex-direction: column; gap: var(--space-2); overflow-y: auto; padding: var(--space-1); margin-bottom: var(--space-5); flex: 1; min-height: 0;">
                ${r?o(r,!0):``}
                ${i.map(e=>o(e,!1)).join(``)}
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="tripMembersCloseBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">${x(c(`companions.closeBtn`))}</button>
            </div>
        `});p(l,`#tripMembersCloseBtn`).onclick=()=>u()},O=()=>{if(!C.activeTripId){_(c(`modals.addDayErrorNoTrip`));return}let e=(C.tripDays||[]).filter(e=>e.tripId===C.activeTripId).sort((e,t)=>e.dayNumber-t.dayNumber),t=e.filter(e=>e.dayNumber>0),r=(t.length>0?t[t.length-1].dayNumber:0)+1,i=``;if(e.length>0){let t=e[e.length-1];if(t.date){let e=new Date(t.date+`T00:00:00Z`);e.setUTCDate(e.getUTCDate()+1),i=e.toISOString().split(`T`)[0]??``}}let{root:a,close:o}=s({variant:`glass-light`,cardStyle:`width: 400px;`,innerHTML:`
            <div style="display: flex; align-items: center; justify-content: center; gap: var(--space-3); margin-bottom: var(--space-5);">
                <div style="background: var(--accent-blue); color: white; width: 28px; height: 28px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: var(--font-base);">${r}</div>
                <h2 class="card-title" style="font-size: var(--font-3xl); margin: 0; color: #000000; letter-spacing: -0.06em; font-weight: 800; text-align: center;">${x(c(`modals.addDayTitle`))}</h2>
            </div>
            <form id="addDayForm" style="display: flex; flex-direction: column; width: 100%;">
                <div class="mb-4">
                    <label class="form-label text-black/50" for="dayName">${x(c(`modals.addDayLabelWhere`))}</label>
                    <input type="text" id="dayName" class="glass-input-modal mdl-btn-dark" value="${x(c(`tripMedia.dayBucketDay`,{n:r}))}" placeholder="${x(c(`modals.addDayPlaceholderWhere`))}" required autofocus>
                </div>
                <div style="margin-bottom: var(--space-6);">
                    <label class="form-label text-black/50" for="dayDate">${x(c(`modals.addDayLabelDate`))} ${i?x(c(`modals.addDayDateAuto`)):``}</label>
                    <input type="date" id="dayDate" class="glass-input-modal mdl-btn-dark" value="${i}" required>
                </div>
                <div style="display: flex; gap: var(--space-2); width: 100%;">
                    <button type="submit" class="btn-primary flex-[2]">${x(c(`modals.addDayConfirmBtn`))}</button>
                    <button type="button" id="cancelDayBtn" class="btn-ghost" style="flex: 1; background: rgba(0,0,0,0.05); color: #000; border: none;">${x(c(`modals.addDayCancelBtn`))}</button>
                </div>
            </form>
        `}),u=C.activeTripId;p(a,`#cancelDayBtn`).onclick=()=>o(),p(a,`#addDayForm`).onsubmit=async e=>{e.preventDefault();let t={id:y(),tripId:u,name:p(a,`#dayName`).value,date:p(a,`#dayDate`).value,dayNumber:r,photos:[],notes:``,plan:{morning:``,afternoon:``,evening:``}};C.tripDays.push(t),l(`state:changed`);let i=await n(t);if(i&&!i.ok){let e=i.status||`no-response`,n=i.body?.error||``;_(c(`modals.addDayErrorServerSave`,{status:n?`${e} · ${n}`:String(e)})),console.error(`[upsertDay] failed`,{dayId:t.id,status:e,body:i.body})}o(),w(`home`)}};export{E as n,D as r,O as t};
//# sourceMappingURL=modals-DBBU3liQ.js.map