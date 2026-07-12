import{n as e}from"./rolldown-runtime-Kw0j5LDr.js";import{$t as t,An as n,Bn as r,Cn as i,Dn as a,I as o,J as s,Jn as c,Mn as l,P as u,Qn as d,Sn as f,Tn as p,Tt as m,Vn as h,Zn as g,an as _,en as v,er as y,jn as b,qn as x,rr as S,rt as C,tn as w,tt as T,w as E}from"../app.bundle.js";import{i as D}from"./balances-CiFuUn00.js";import{n as O,t as k}from"./trip-DL8gQ3W6.js";import{i as A,n as j,t as M}from"./tripExport-D6fHTC-i.js";import{n as N,r as P,t as F}from"./share-CNo1X_Wd.js";var I=e=>{let n=x.trips.find(t=>t.id===e);if(!n)return;if(!_(n)){L(e);return}Array.isArray(n.companions)||(n.companions=[]);let u=x.user?.id,m=new Set(x.expenses.filter(t=>t.tripId===e).flatMap(e=>[e.who,...Object.keys(e.splits||{})]).filter(Boolean).map(e=>String(e).toLocaleLowerCase())),O=t=>{let n=t.toLocaleLowerCase();return m.has(n)?!0:(x.budgets||[]).some(t=>t.tripId===e&&(t.user||``).toLocaleLowerCase()===n)},k=new Map((n.members||[]).map(e=>[e.userId,e])),A=[],j=e=>e===`planner`?E(`companions.rolePlanner`):e===`budgeteer`?E(`companions.roleBudgeteer`):e===`relaxer`?E(`companions.roleRelaxer`):e,M=e=>{let t=O(e.name),n=e.linkedUserId,r=!!n&&n===u,i=n?k.get(n):null,o=``;o=r?`<span class="companion-link-pill companion-link-pill--linked" title="${a(E(`companions.pillYouText`))}">${a(E(`companions.pillYouText`))}</span>`:i?`<span class="companion-link-pill companion-link-pill--linked" title="${a(E(`companions.pillLinkedTitle`))}">${a(j(i.role))}</span>`:n?`<span class="companion-link-pill companion-link-pill--pending" title="${a(E(`companions.pillPendingTitle`))}">${a(E(`companions.pillPendingText`))}</span>`:`<span class="companion-link-pill companion-link-pill--companion">${a(E(`companions.pillUnlinkedText`))}</span>`;let s=``;n?r?s=`<button type="button" class="btn-link-action picker-unlink-btn" data-name="${a(e.name)}">${a(E(`companions.rowUnlinkBtn`))}</button>`:i||(s=`<button type="button" class="btn-link-action picker-cancel-invite-btn" data-name="${a(e.name)}">${a(E(`companions.rowCancelInviteBtn`))}</button>`):s=`<button type="button" class="btn-link-action picker-link-btn" data-name="${a(e.name)}">${a(E(`companions.rowLinkBtn`))}</button>`;let c=r?``:t?`<span class="companion-row__lock" title="${a(E(`companions.rowLockTitle`))}" style="display:inline-flex; align-items:center;">${p(`lock`,{size:14})}</span>`:`<button type="button" class="btn-x-bare picker-remove-btn" data-name="${a(e.name)}" title="${a(E(`companions.rowRemoveTitle`))}">✕</button>`;return`
            <div class="companion-row" data-name="${a(e.name)}">
                <span class="companion-row__name">${a(e.name)}</span>
                ${o}
                <span style="flex:1;"></span>
                ${s}
                ${c}
            </div>
        `},N=()=>{let e=n.companions||[];return e.length===0?`<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-6); margin: 0;">
                ${a(E(`companions.pickerEmpty`))}
            </p>`:e.map(M).join(``)},{root:P,close:F}=i({variant:`glass-light`,cardStyle:`width: min(520px, calc(100vw - 24px)); max-width: 100%; max-height: 85vh; display: flex; flex-direction: column;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${a(E(`companions.pickerTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                ${E(`companions.pickerIntro`,{trip:a(n.name)})}
            </p>

            <div id="companionPickerList" style="display: flex; flex-direction: column; gap: var(--space-2); overflow-y: auto; padding: var(--space-1); margin-bottom: var(--space-4); flex: 1; min-height: 0;">
                ${N()}
            </div>

            <!-- Add someone — two clearly-labeled paths so it reads as a
                 choice, not two mystery controls: (1) a friend with an
                 account (gets a trip invite), (2) just a name for a
                 non-app traveller. Same element ids as before so every
                 handler is unchanged. Both write to trip.companions
                 immediately, so what the user sees IS the saved state. -->
            <div class="companion-picker-add-section">
                <div class="companion-picker-add-title">${a(E(`companions.addSectionTitle`))}</div>

                <div class="companion-picker-add-path">
                    <div class="companion-picker-add-path__text">
                        <div class="companion-picker-add-path__name">${a(E(`companions.addPathFriendTitle`))}</div>
                        <div class="companion-picker-add-path__hint">${a(E(`companions.addPathFriendHint`))}</div>
                    </div>
                    <button type="button" id="companionPickerAddFriendBtn" class="companion-picker-add-section__friend-btn">
                        <span style="display:inline-flex; align-items:center;">${p(`user`,{size:16})}</span>
                        <span>${a(E(`companions.addFriendBtn`))}</span>
                    </button>
                </div>

                <div class="companion-picker-add-path">
                    <div class="companion-picker-add-path__text">
                        <div class="companion-picker-add-path__name">${a(E(`companions.addPathNameTitle`))}</div>
                        <div class="companion-picker-add-path__hint">${a(E(`companions.addPathNameHint`))}</div>
                    </div>
                    <form id="companionPickerAddForm" class="companion-picker-add-form" style="margin-bottom: 0;">
                        <input type="text" id="companionPickerAddInput" class="companion-picker-add-form__input" placeholder="${a(E(`companions.addInputPlaceholder`))}" autocomplete="off" maxlength="200">
                        <button type="submit" class="companion-picker-add-form__btn">${a(E(`companions.addBtn`))}</button>
                    </form>
                </div>
            </div>

            <!-- Friend picker (hidden by default) — appears when "Add a
                 friend" is clicked, listing accepted friends not already
                 on this trip. Pick one + role → adds to trip + invites. -->
            <div id="companionPickerFriendSheet" class="companion-picker-friend-sheet" hidden>
                <div class="companion-picker-friend-sheet__header">
                    <strong id="companionPickerFriendSheetTitle">${a(E(`companions.friendSheetTitle`))}</strong>
                    <button type="button" id="companionPickerFriendCancel" class="btn-x-bare" title="${a(E(`companions.rowCloseTitle`))}">✕</button>
                </div>
                <div id="companionPickerFriendList" class="companion-picker-friend-sheet__list">
                    <p style="text-align:center; color: rgba(0,0,0,0.45); padding: var(--space-4); margin: 0;">${a(E(`companions.friendSheetLoading`))}</p>
                </div>
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="companionPickerCloseBtn" class="btn-primary" style="flex: 1; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">${a(E(`companions.doneBtn`))}</button>
            </div>
        `}),I=b(P,`#companionPickerList`),R=b(P,`#companionPickerFriendSheet`),z=b(P,`#companionPickerFriendList`),B=b(P,`#companionPickerFriendSheetTitle`),V=b(P,`#companionPickerAddInput`),H=()=>{I.innerHTML=N()},U=()=>{let e=R.dataset.linkTargetName,r=new Set((n.companions||[]).map(e=>e.linkedUserId).filter(Boolean)),i=A.filter(e=>e.id!==u&&!r.has(e.id)),o=e&&u?`
            <div class="companion-row friend-pick-row picker-self-row">
                ${x.user?.picture?`<img src="${a(x.user.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">`:``}
                <span class="companion-row__name">${a(x.user?.name||E(`companions.pillYouText`))}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${a(E(`companions.pillYouText`))}</span>
                <button type="button" class="btn-link-action picker-link-self-btn">${a(E(`companions.linkMeBtn`))}</button>
            </div>`:``;if(i.length===0&&!o){z.innerHTML=`<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-4); margin: 0;">
                ${a(E(`companions.friendSheetEmpty`))}
            </p>`;return}z.innerHTML=o+i.map(e=>`
            <div class="companion-row friend-pick-row picker-friend-row" data-friend-id="${a(e.id)}" data-friend-name="${a(e.name)}">
                <img src="${a(e.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">
                <span class="companion-row__name">${a(e.name)}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${a(e.email)}</span>
                <select class="companion-row__role-select picker-friend-role-select">
                    <option value="${w}" selected>${a(E(`companions.roleRelaxer`))}</option>
                    <option value="${t}">${a(E(`companions.roleBudgeteer`))}</option>
                    <option value="${v}">${a(E(`companions.rolePlanner`))}</option>
                </select>
                <button type="button" class="btn-link-action picker-friend-add-btn">${a(E(`companions.friendAddBtn`))}</button>
            </div>
        `).join(``)};b(P,`#companionPickerCloseBtn`).onclick=()=>{F(),c(`state:changed`)},b(P,`#companionPickerFriendCancel`).onclick=()=>{R.hidden=!0},b(P,`#companionPickerAddFriendBtn`).onclick=async()=>{delete R.dataset.linkTargetName,B&&(B.textContent=E(`companions.friendSheetTitle`)),R.hidden=!1,A=await s(),U()},b(P,`#companionPickerAddForm`).onsubmit=e=>{e.preventDefault();let t=V.value.trim();if(t){if(y(n,t)){l(E(`companions.addDuplicate`,{name:t}),`info`),V.value=``,V.focus();return}g(n,t),c(`state:changed`),o(n),V.value=``,H()}},P.addEventListener(`click`,e=>{(async()=>{let t=e.target;if(!t)return;let i=t.closest(`.picker-remove-btn`);if(i?.dataset.name){let e=i.dataset.name,t=y(n,e);if(!t||t.linkedUserId&&t.linkedUserId===u)return;let a=()=>{S(n,e),c(`state:changed`),o(n),t.linkedUserId&&C(n.id,t.linkedUserId),H()},{balances:s}=D(n),l=s[e]??0;if(Math.abs(l)>.01){let t=h();f({title:E(`companions.removeWithBalanceTitle`),message:l>0?E(`companions.removeWithBalanceOwed`,{name:e,amount:r(l,t)}):E(`companions.removeWithBalanceOwes`,{name:e,amount:r(Math.abs(l),t)}),confirmText:E(`common.remove`),onConfirm:a})}else t.linkedUserId?f({title:E(`companions.removeConfirmTitle`),message:E(`companions.removeConfirmBody`,{name:e}),confirmText:E(`common.remove`),onConfirm:a}):a();return}let a=t.closest(`.picker-unlink-btn`);if(a?.dataset.name){let e=y(n,a.dataset.name);e&&delete e.linkedUserId,c(`state:changed`),o(n),H();return}let p=t.closest(`.picker-cancel-invite-btn`);if(p?.dataset.name){let e=p.dataset.name,t=y(n,e);if(!t||!t.linkedUserId||t.linkedUserId===u)return;let r=t.linkedUserId;f({title:E(`companions.cancelInviteTitle`),message:E(`companions.cancelInviteBody`,{name:e}),confirmText:E(`companions.cancelInviteConfirm`),onConfirm:()=>{delete t.linkedUserId,c(`state:changed`),o(n),C(n.id,r),H()}});return}let m=t.closest(`.picker-link-btn`);if(m?.dataset.name){R.hidden=!1,R.dataset.linkTargetName=m.dataset.name,B&&(B.textContent=E(`companions.linkSheetTitle`)),A=await s(),U();return}if(t.closest(`.picker-link-self-btn`)){let e=R.dataset.linkTargetName;if(e&&u){let t=y(n,e);t&&(t.linkedUserId=u,d(n,u,t.name,O)),delete R.dataset.linkTargetName,c(`state:changed`),o(n),R.hidden=!0,H()}return}let _=t.closest(`.picker-friend-add-btn`);if(_){let e=_.closest(`.picker-friend-row`);if(!e?.dataset.friendId)return;let t=e.dataset.friendId,r=e.dataset.friendName||`Friend`,i=e.querySelector(`.picker-friend-role-select`)?.value||`relaxer`,a=await T(n.id,t,i);if(!a.ok){l(a.status===409?E(`companions.inviteRoleConflict`,{name:r}):a.status===404?E(`companions.inviteUnavailable`,{name:r}):E(`companions.inviteFailed`,{name:r}));return}let s=R.dataset.linkTargetName,u=r;if(s){let e=y(n,s);e?(e.linkedUserId=t,u=e.name):u=g(n,r,t).name,delete R.dataset.linkTargetName}else{let e=y(n,r);e&&!e.linkedUserId?(e.linkedUserId=t,u=e.name):u=g(n,r,t).name}d(n,t,u,O),c(`state:changed`),o(n),R.hidden=!0,H(),l(E(`companions.invitedToast`,{name:r,role:j(i)}),`success`)}})()})},L=e=>{let t=x.trips.find(t=>t.id===e);if(!t)return;let n=t.members||[],r=n.find(e=>e.userId===t.ownerId),o=n.filter(e=>e.userId!==t.ownerId),s=e=>e===`planner`?E(`companions.rolePlanner`):e===`budgeteer`?E(`companions.roleBudgeteer`):e===`relaxer`?E(`companions.roleRelaxer`):e,c=(e,t)=>`
        <div class="companion-row" style="cursor: default;">
            ${e.picture?`<img src="${a(e.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">`:``}
            <span class="companion-row__name">${a(e.name||e.userId)}</span>
            <span class="companion-link-pill ${t?`companion-link-pill--linked`:`companion-link-pill--pending`}">
                ${a(t?E(`companions.membersOwnerBadge`):s(e.role))}
            </span>
        </div>
    `,{root:l,close:u}=i({variant:`glass-light`,cardStyle:`width: min(460px, calc(100vw - 24px)); max-width: 100%; max-height: 85vh; display: flex; flex-direction: column;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${a(E(`companions.membersTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                ${E(`companions.membersIntro`,{trip:a(t.name),role:a(s(t.myRole||`relaxer`))})}
            </p>

            <div style="display: flex; flex-direction: column; gap: var(--space-2); overflow-y: auto; padding: var(--space-1); margin-bottom: var(--space-5); flex: 1; min-height: 0;">
                ${r?c(r,!0):``}
                ${o.map(e=>c(e,!1)).join(``)}
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="tripMembersCloseBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">${a(E(`companions.closeBtn`))}</button>
            </div>
        `});b(l,`#tripMembersCloseBtn`).onclick=()=>u()},R=()=>{if(!x.activeTripId){l(E(`modals.addDayErrorNoTrip`));return}let e=(x.tripDays||[]).filter(e=>e.tripId===x.activeTripId).sort((e,t)=>e.dayNumber-t.dayNumber),t=e.filter(e=>e.dayNumber>0),r=(t.length>0?t[t.length-1].dayNumber:0)+1,o=``;if(e.length>0){let t=e[e.length-1];if(t.date){let e=new Date(t.date+`T00:00:00Z`);e.setUTCDate(e.getUTCDate()+1),o=e.toISOString().split(`T`)[0]??``}}let{root:s,close:d}=i({variant:`glass-light`,cardStyle:`width: 400px;`,innerHTML:`
            <div style="display: flex; align-items: center; justify-content: center; gap: var(--space-3); margin-bottom: var(--space-5);">
                <div style="background: var(--accent-blue); color: white; width: 28px; height: 28px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: var(--font-base);">${r}</div>
                <h2 class="card-title" style="font-size: var(--font-3xl); margin: 0; color: #000000; letter-spacing: -0.06em; font-weight: 800; text-align: center;">${a(E(`modals.addDayTitle`))}</h2>
            </div>
            <form id="addDayForm" style="display: flex; flex-direction: column; width: 100%;">
                <div class="mb-4">
                    <label class="form-label text-black/50" for="dayName">${a(E(`modals.addDayLabelWhere`))}</label>
                    <input type="text" id="dayName" class="glass-input-modal mdl-btn-dark" value="${a(E(`tripMedia.dayBucketDay`,{n:r}))}" placeholder="${a(E(`modals.addDayPlaceholderWhere`))}" required autofocus>
                </div>
                <div style="margin-bottom: var(--space-6);">
                    <label class="form-label text-black/50" for="dayDate">${a(E(`modals.addDayLabelDate`))} ${o?a(E(`modals.addDayDateAuto`)):``}</label>
                    <input type="date" id="dayDate" class="glass-input-modal mdl-btn-dark" value="${o}" required>
                </div>
                <div style="display: flex; gap: var(--space-2); width: 100%;">
                    <button type="submit" class="btn-primary flex-[2]">${a(E(`modals.addDayConfirmBtn`))}</button>
                    <button type="button" id="cancelDayBtn" class="btn-ghost" style="flex: 1; background: rgba(0,0,0,0.05); color: #000; border: none;">${a(E(`modals.addDayCancelBtn`))}</button>
                </div>
            </form>
        `}),f=x.activeTripId;b(s,`#cancelDayBtn`).onclick=()=>d(),b(s,`#addDayForm`).onsubmit=async e=>{e.preventDefault();let t={id:n(),tripId:f,name:b(s,`#dayName`).value,date:b(s,`#dayDate`).value,dayNumber:r,photos:[],notes:``,plan:{morning:``,afternoon:``,evening:``}};x.tripDays.push(t),c(`state:changed`);let i=await u(t);if(i&&!i.ok){let e=i.status||`no-response`,n=i.body?.error||``;l(E(`modals.addDayErrorServerSave`,{status:n?`${e} · ${n}`:String(e)})),console.error(`[upsertDay] failed`,{dayId:t.id,status:e,body:i.body})}d(),m(`home`)}},z=e({importTripFromFile:()=>M,openAddDayModal:()=>R,openCompanionPickerModal:()=>I,openDownloadChooserModal:()=>j,openEditTripModal:()=>k,openNewTripModal:()=>O,openPdfExportModal:()=>A,openShareChooserModal:()=>F,openShareTripModal:()=>N,openTripInviteResponseModal:()=>P});export{L as i,R as n,I as r,z as t};
//# sourceMappingURL=modals-DvUDCebU.js.map