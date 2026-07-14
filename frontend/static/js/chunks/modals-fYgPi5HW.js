import{n as e}from"./rolldown-runtime-Kw0j5LDr.js";import{$n as t,$t as n,Dn as r,Hn as i,I as a,J as o,Jt as s,Nn as c,On as l,P as u,Sn as d,Tn as f,Tt as p,Un as m,Xn as h,Yn as g,Yt as _,ar as v,bn as y,er as b,nr as x,qt as S,rt as C,tt as w,w as T,yn as E}from"../app.bundle.js";import{i as D}from"./balances-BnHKqDfW.js";import{n as O,t as k}from"./trip-CTIheG3z.js";import{i as A,n as j,t as M}from"./tripExport-BKD0Icz8.js";import{n as N,r as P,t as F}from"./share-92FOpeNK.js";var I=e=>{let u=g.trips.find(t=>t.id===e);if(!u)return;if(!n(u)){L(e);return}Array.isArray(u.companions)||(u.companions=[]);let f=g.user?.id,p=new Set(g.expenses.filter(t=>t.tripId===e).flatMap(e=>[e.who,...Object.keys(e.splits||{})]).filter(Boolean).map(e=>String(e).toLocaleLowerCase())),O=t=>{let n=t.toLocaleLowerCase();return p.has(n)?!0:(g.budgets||[]).some(t=>t.tripId===e&&(t.user||``).toLocaleLowerCase()===n)},k=new Map((u.members||[]).map(e=>[e.userId,e])),A=[],j=e=>e===`planner`?T(`companions.rolePlanner`):e===`budgeteer`?T(`companions.roleBudgeteer`):e===`relaxer`?T(`companions.roleRelaxer`):e,M=e=>{let t=O(e.name),n=e.linkedUserId,r=!!n&&n===f,i=n?k.get(n):null,a=``;a=r?`<span class="companion-link-pill companion-link-pill--linked" title="${d(T(`companions.pillYouText`))}">${d(T(`companions.pillYouText`))}</span>`:i?`<span class="companion-link-pill companion-link-pill--linked" title="${d(T(`companions.pillLinkedTitle`))}">${d(j(i.role))}</span>`:n?`<span class="companion-link-pill companion-link-pill--pending" title="${d(T(`companions.pillPendingTitle`))}">${d(T(`companions.pillPendingText`))}</span>`:`<span class="companion-link-pill companion-link-pill--companion">${d(T(`companions.pillUnlinkedText`))}</span>`;let o=``;n?r?o=`<button type="button" class="btn-link-action picker-unlink-btn" data-name="${d(e.name)}">${d(T(`companions.rowUnlinkBtn`))}</button>`:i||(o=`<button type="button" class="btn-link-action picker-cancel-invite-btn" data-name="${d(e.name)}">${d(T(`companions.rowCancelInviteBtn`))}</button>`):o=`<button type="button" class="btn-link-action picker-link-btn" data-name="${d(e.name)}">${d(T(`companions.rowLinkBtn`))}</button>`;let s=r?``:t?`<span class="companion-row__lock" title="${d(T(`companions.rowLockTitle`))}" style="display:inline-flex; align-items:center;">${c(`lock`,{size:14})}</span>`:`<button type="button" class="btn-x-bare picker-remove-btn" data-name="${d(e.name)}" title="${d(T(`companions.rowRemoveTitle`))}">${c(`close`,{size:14})}</button>`;return`
            <div class="companion-row" data-name="${d(e.name)}">
                <span class="companion-row__name">${d(e.name)}</span>
                ${a}
                <span style="flex:1;"></span>
                ${o}
                ${s}
            </div>
        `},N=()=>{let e=u.companions||[];return e.length===0?`<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-6); margin: 0;">
                ${d(T(`companions.pickerEmpty`))}
            </p>`:e.map(M).join(``)},{root:P,close:F}=y({variant:`glass-light`,cardStyle:`width: min(520px, calc(100vw - 24px)); max-width: 100%; max-height: 85vh; display: flex; flex-direction: column;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${d(T(`companions.pickerTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                ${T(`companions.pickerIntro`,{trip:d(u.name)})}
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
                <div class="companion-picker-add-title">${d(T(`companions.addSectionTitle`))}</div>

                <div class="companion-picker-add-path">
                    <div class="companion-picker-add-path__text">
                        <div class="companion-picker-add-path__name">${d(T(`companions.addPathFriendTitle`))}</div>
                        <div class="companion-picker-add-path__hint">${d(T(`companions.addPathFriendHint`))}</div>
                    </div>
                    <button type="button" id="companionPickerAddFriendBtn" class="companion-picker-add-section__friend-btn">
                        <span style="display:inline-flex; align-items:center;">${c(`user`,{size:16})}</span>
                        <span>${d(T(`companions.addFriendBtn`))}</span>
                    </button>
                </div>

                <div class="companion-picker-add-path">
                    <div class="companion-picker-add-path__text">
                        <div class="companion-picker-add-path__name">${d(T(`companions.addPathNameTitle`))}</div>
                        <div class="companion-picker-add-path__hint">${d(T(`companions.addPathNameHint`))}</div>
                    </div>
                    <form id="companionPickerAddForm" class="companion-picker-add-form" style="margin-bottom: 0;">
                        <input type="text" id="companionPickerAddInput" class="companion-picker-add-form__input" placeholder="${d(T(`companions.addInputPlaceholder`))}" autocomplete="off" maxlength="200">
                        <button type="submit" class="companion-picker-add-form__btn">${d(T(`companions.addBtn`))}</button>
                    </form>
                </div>
            </div>

            <!-- Friend picker (hidden by default) — appears when "Add a
                 friend" is clicked, listing accepted friends not already
                 on this trip. Pick one + role → adds to trip + invites. -->
            <div id="companionPickerFriendSheet" class="companion-picker-friend-sheet" hidden>
                <div class="companion-picker-friend-sheet__header">
                    <strong id="companionPickerFriendSheetTitle">${d(T(`companions.friendSheetTitle`))}</strong>
                    <button type="button" id="companionPickerFriendCancel" class="btn-x-bare" title="${d(T(`companions.rowCloseTitle`))}">${c(`close`,{size:14})}</button>
                </div>
                <div id="companionPickerFriendList" class="companion-picker-friend-sheet__list">
                    <p style="text-align:center; color: rgba(0,0,0,0.45); padding: var(--space-4); margin: 0;">${d(T(`companions.friendSheetLoading`))}</p>
                </div>
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="companionPickerCloseBtn" class="btn-primary" style="flex: 1; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">${d(T(`companions.doneBtn`))}</button>
            </div>
        `}),I=r(P,`#companionPickerList`),R=r(P,`#companionPickerFriendSheet`),z=r(P,`#companionPickerFriendList`),B=r(P,`#companionPickerFriendSheetTitle`),V=r(P,`#companionPickerAddInput`),H=()=>{I.innerHTML=N()},U=()=>{let e=R.dataset.linkTargetName,t=new Set((u.companions||[]).map(e=>e.linkedUserId).filter(Boolean)),n=A.filter(e=>e.id!==f&&!t.has(e.id)),r=e&&f?`
            <div class="companion-row friend-pick-row picker-self-row">
                ${g.user?.picture?`<img src="${d(g.user.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">`:``}
                <span class="companion-row__name">${d(g.user?.name||T(`companions.pillYouText`))}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${d(T(`companions.pillYouText`))}</span>
                <button type="button" class="btn-link-action picker-link-self-btn">${d(T(`companions.linkMeBtn`))}</button>
            </div>`:``;if(n.length===0&&!r){z.innerHTML=`<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-4); margin: 0;">
                ${d(T(`companions.friendSheetEmpty`))}
            </p>`;return}z.innerHTML=r+n.map(e=>`
            <div class="companion-row friend-pick-row picker-friend-row" data-friend-id="${d(e.id)}" data-friend-name="${d(e.name)}">
                <img src="${d(e.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">
                <span class="companion-row__name">${d(e.name)}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${d(e.email)}</span>
                <select class="companion-row__role-select picker-friend-role-select">
                    <option value="${_}" selected>${d(T(`companions.roleRelaxer`))}</option>
                    <option value="${S}">${d(T(`companions.roleBudgeteer`))}</option>
                    <option value="${s}">${d(T(`companions.rolePlanner`))}</option>
                </select>
                <button type="button" class="btn-link-action picker-friend-add-btn">${d(T(`companions.friendAddBtn`))}</button>
            </div>
        `).join(``)};r(P,`#companionPickerCloseBtn`).onclick=()=>{F(),h(`state:changed`)},r(P,`#companionPickerFriendCancel`).onclick=()=>{R.hidden=!0},r(P,`#companionPickerAddFriendBtn`).onclick=async()=>{delete R.dataset.linkTargetName,B&&(B.textContent=T(`companions.friendSheetTitle`)),R.hidden=!1,A=await o(),U()},r(P,`#companionPickerAddForm`).onsubmit=e=>{e.preventDefault();let n=V.value.trim();if(n){if(x(u,n)){l(T(`companions.addDuplicate`,{name:n}),`info`),V.value=``,V.focus();return}t(u,n),h(`state:changed`),a(u),V.value=``,H()}},P.addEventListener(`click`,e=>{(async()=>{let n=e.target;if(!n)return;let r=n.closest(`.picker-remove-btn`);if(r?.dataset.name){let e=r.dataset.name,t=x(u,e);if(!t||t.linkedUserId&&t.linkedUserId===f)return;let n=()=>{v(u,e),h(`state:changed`),a(u),t.linkedUserId&&C(u.id,t.linkedUserId),H()},{balances:o}=D(u),s=o[e]??0;if(Math.abs(s)>.01){let t=m();E({title:T(`companions.removeWithBalanceTitle`),message:s>0?T(`companions.removeWithBalanceOwed`,{name:e,amount:i(s,t)}):T(`companions.removeWithBalanceOwes`,{name:e,amount:i(Math.abs(s),t)}),confirmText:T(`common.remove`),onConfirm:n})}else t.linkedUserId?E({title:T(`companions.removeConfirmTitle`),message:T(`companions.removeConfirmBody`,{name:e}),confirmText:T(`common.remove`),onConfirm:n}):n();return}let s=n.closest(`.picker-unlink-btn`);if(s?.dataset.name){let e=x(u,s.dataset.name);e&&delete e.linkedUserId,h(`state:changed`),a(u),H();return}let c=n.closest(`.picker-cancel-invite-btn`);if(c?.dataset.name){let e=c.dataset.name,t=x(u,e);if(!t||!t.linkedUserId||t.linkedUserId===f)return;let n=t.linkedUserId;E({title:T(`companions.cancelInviteTitle`),message:T(`companions.cancelInviteBody`,{name:e}),confirmText:T(`companions.cancelInviteConfirm`),onConfirm:()=>{delete t.linkedUserId,h(`state:changed`),a(u),C(u.id,n),H()}});return}let d=n.closest(`.picker-link-btn`);if(d?.dataset.name){R.hidden=!1,R.dataset.linkTargetName=d.dataset.name,B&&(B.textContent=T(`companions.linkSheetTitle`)),A=await o(),U();return}if(n.closest(`.picker-link-self-btn`)){let e=R.dataset.linkTargetName;if(e&&f){let t=x(u,e);t&&(t.linkedUserId=f,b(u,f,t.name,O)),delete R.dataset.linkTargetName,h(`state:changed`),a(u),R.hidden=!0,H()}return}let p=n.closest(`.picker-friend-add-btn`);if(p){let e=p.closest(`.picker-friend-row`);if(!e?.dataset.friendId)return;let n=e.dataset.friendId,r=e.dataset.friendName||`Friend`,i=e.querySelector(`.picker-friend-role-select`)?.value||`relaxer`,o=await w(u.id,n,i);if(!o.ok){l(o.status===409?T(`companions.inviteRoleConflict`,{name:r}):o.status===404?T(`companions.inviteUnavailable`,{name:r}):T(`companions.inviteFailed`,{name:r}));return}let s=R.dataset.linkTargetName,c=r;if(s){let e=x(u,s);e?(e.linkedUserId=n,c=e.name):c=t(u,r,n).name,delete R.dataset.linkTargetName}else{let e=x(u,r);e&&!e.linkedUserId?(e.linkedUserId=n,c=e.name):c=t(u,r,n).name}b(u,n,c,O),h(`state:changed`),a(u),R.hidden=!0,H(),l(T(`companions.invitedToast`,{name:r,role:j(i)}),`success`)}})()})},L=e=>{let t=g.trips.find(t=>t.id===e);if(!t)return;let n=t.members||[],i=n.find(e=>e.userId===t.ownerId),a=n.filter(e=>e.userId!==t.ownerId),o=e=>e===`planner`?T(`companions.rolePlanner`):e===`budgeteer`?T(`companions.roleBudgeteer`):e===`relaxer`?T(`companions.roleRelaxer`):e,s=(e,t)=>`
        <div class="companion-row" style="cursor: default;">
            ${e.picture?`<img src="${d(e.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">`:``}
            <span class="companion-row__name">${d(e.name||e.userId)}</span>
            <span class="companion-link-pill ${t?`companion-link-pill--linked`:`companion-link-pill--pending`}">
                ${d(t?T(`companions.membersOwnerBadge`):o(e.role))}
            </span>
        </div>
    `,{root:c,close:l}=y({variant:`glass-light`,cardStyle:`width: min(460px, calc(100vw - 24px)); max-width: 100%; max-height: 85vh; display: flex; flex-direction: column;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${d(T(`companions.membersTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                ${T(`companions.membersIntro`,{trip:d(t.name),role:d(o(t.myRole||`relaxer`))})}
            </p>

            <div style="display: flex; flex-direction: column; gap: var(--space-2); overflow-y: auto; padding: var(--space-1); margin-bottom: var(--space-5); flex: 1; min-height: 0;">
                ${i?s(i,!0):``}
                ${a.map(e=>s(e,!1)).join(``)}
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="tripMembersCloseBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">${d(T(`companions.closeBtn`))}</button>
            </div>
        `});r(c,`#tripMembersCloseBtn`).onclick=()=>l()},R=()=>{if(!g.activeTripId){l(T(`modals.addDayErrorNoTrip`));return}let e=(g.tripDays||[]).filter(e=>e.tripId===g.activeTripId).sort((e,t)=>e.dayNumber-t.dayNumber),t=e.filter(e=>e.dayNumber>0),n=(t.length>0?t[t.length-1].dayNumber:0)+1,i=``;if(e.length>0){let t=e[e.length-1];if(t.date){let e=new Date(t.date+`T00:00:00Z`);e.setUTCDate(e.getUTCDate()+1),i=e.toISOString().split(`T`)[0]??``}}let{root:a,close:o}=y({variant:`glass-light`,cardStyle:`width: 400px;`,innerHTML:`
            <div style="display: flex; align-items: center; justify-content: center; gap: var(--space-3); margin-bottom: var(--space-5);">
                <div style="background: var(--accent-blue); color: white; width: 28px; height: 28px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: var(--font-base);">${n}</div>
                <h2 class="card-title" style="font-size: var(--font-3xl); margin: 0; color: #000000; letter-spacing: -0.06em; font-weight: 800; text-align: center;">${d(T(`modals.addDayTitle`))}</h2>
            </div>
            <form id="addDayForm" style="display: flex; flex-direction: column; width: 100%;">
                <div class="mb-4">
                    <label class="form-label text-black/50" for="dayName">${d(T(`modals.addDayLabelWhere`))}</label>
                    <input type="text" id="dayName" class="glass-input-modal mdl-btn-dark" value="${d(T(`tripMedia.dayBucketDay`,{n}))}" placeholder="${d(T(`modals.addDayPlaceholderWhere`))}" required autofocus>
                </div>
                <div style="margin-bottom: var(--space-6);">
                    <label class="form-label text-black/50" for="dayDate">${d(T(`modals.addDayLabelDate`))} ${i?d(T(`modals.addDayDateAuto`)):``}</label>
                    <input type="date" id="dayDate" class="glass-input-modal mdl-btn-dark" value="${i}" required>
                </div>
                <div style="display: flex; gap: var(--space-2); width: 100%;">
                    <button type="submit" class="btn-primary flex-[2]">${d(T(`modals.addDayConfirmBtn`))}</button>
                    <button type="button" id="cancelDayBtn" class="btn-ghost" style="flex: 1; background: rgba(0,0,0,0.05); color: #000; border: none;">${d(T(`modals.addDayCancelBtn`))}</button>
                </div>
            </form>
        `}),s=g.activeTripId;r(a,`#cancelDayBtn`).onclick=()=>o(),r(a,`#addDayForm`).onsubmit=async e=>{e.preventDefault();let t={id:f(),tripId:s,name:r(a,`#dayName`).value,date:r(a,`#dayDate`).value,dayNumber:n,photos:[],notes:``,plan:{morning:``,afternoon:``,evening:``}};g.tripDays.push(t),h(`state:changed`);let i=await u(t);if(i&&!i.ok){let e=i.status||`no-response`,n=i.body?.error||``;l(T(`modals.addDayErrorServerSave`,{status:n?`${e} · ${n}`:String(e)})),console.error(`[upsertDay] failed`,{dayId:t.id,status:e,body:i.body})}o(),p(`home`)}},z=e({importTripFromFile:()=>M,openAddDayModal:()=>R,openCompanionPickerModal:()=>I,openDownloadChooserModal:()=>j,openEditTripModal:()=>k,openNewTripModal:()=>O,openPdfExportModal:()=>A,openShareChooserModal:()=>F,openShareTripModal:()=>N,openTripInviteResponseModal:()=>P});export{L as i,R as n,I as r,z as t};
//# sourceMappingURL=modals-fYgPi5HW.js.map