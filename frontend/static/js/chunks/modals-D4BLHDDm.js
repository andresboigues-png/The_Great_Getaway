import{n as e}from"./rolldown-runtime-Kw0j5LDr.js";import{En as t,G as n,Hn as r,In as i,Ln as a,Mn as o,N as s,Nn as c,Pt as l,Tn as u,U as d,_n as f,an as p,c as m,cn as h,dn as g,ft as _,gn as v,i as y,mn as b,n as x,on as S,r as C,rt as w,ut as T,zn as E}from"../app.bundle.js";import{i as D}from"./balances-BELCLsxs.js";import{n as O,t as k}from"./trip-BTxASHyo.js";import{i as A,n as j,t as M}from"./tripExport-CI-VAkuZ.js";import{n as N,r as P,t as F}from"./share-C6e89dOK.js";var I=e=>{let l=o.trips.find(t=>t.id===e);if(!l)return;if(!m(l)){L(e);return}Array.isArray(l.companions)||(l.companions=[]);let d=o.user?.id,b=new Set(o.expenses.filter(t=>t.tripId===e).flatMap(e=>[e.who,...Object.keys(e.splits||{})]).filter(Boolean).map(e=>String(e).toLocaleLowerCase())),O=t=>{let n=t.toLocaleLowerCase();return b.has(n)?!0:(o.budgets||[]).some(t=>t.tripId===e&&(t.user||``).toLocaleLowerCase()===n)},k=new Map((l.members||[]).map(e=>[e.userId,e])),A=[],j=e=>e===`planner`?s(`companions.rolePlanner`):e===`budgeteer`?s(`companions.roleBudgeteer`):e===`relaxer`?s(`companions.roleRelaxer`):e,M=e=>{let t=O(e.name),n=e.linkedUserId,r=!!n&&n===d,i=n?k.get(n):null,a=``;a=r?`<span class="companion-link-pill companion-link-pill--linked" title="${g(s(`companions.pillYouText`))}">${g(s(`companions.pillYouText`))}</span>`:i?`<span class="companion-link-pill companion-link-pill--linked" title="${g(s(`companions.pillLinkedTitle`))}">${g(j(i.role))}</span>`:n?`<span class="companion-link-pill companion-link-pill--pending" title="${g(s(`companions.pillPendingTitle`))}">${g(s(`companions.pillPendingText`))}</span>`:`<span class="companion-link-pill companion-link-pill--companion">${g(s(`companions.pillUnlinkedText`))}</span>`;let o=``;n?r?o=`<button type="button" class="btn-link-action picker-unlink-btn" data-name="${g(e.name)}">${g(s(`companions.rowUnlinkBtn`))}</button>`:i||(o=`<button type="button" class="btn-link-action picker-cancel-invite-btn" data-name="${g(e.name)}">${g(s(`companions.rowCancelInviteBtn`))}</button>`):o=`<button type="button" class="btn-link-action picker-link-btn" data-name="${g(e.name)}">${g(s(`companions.rowLinkBtn`))}</button>`;let c=r?``:t?`<span class="companion-row__lock" title="${g(s(`companions.rowLockTitle`))}" style="display:inline-flex; align-items:center;">${h(`lock`,{size:14})}</span>`:`<button type="button" class="btn-x-bare picker-remove-btn" data-name="${g(e.name)}" title="${g(s(`companions.rowRemoveTitle`))}">✕</button>`;return`
            <div class="companion-row" data-name="${g(e.name)}">
                <span class="companion-row__name">${g(e.name)}</span>
                ${a}
                <span style="flex:1;"></span>
                ${o}
                ${c}
            </div>
        `},N=()=>{let e=l.companions||[];return e.length===0?`<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-6); margin: 0;">
                ${g(s(`companions.pickerEmpty`))}
            </p>`:e.map(M).join(``)},{root:P,close:F}=S({variant:`glass-light`,cardStyle:`width: min(520px, calc(100vw - 24px)); max-width: 100%; max-height: 85vh; display: flex; flex-direction: column;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${g(s(`companions.pickerTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                ${s(`companions.pickerIntro`,{trip:g(l.name)})}
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
                <div class="companion-picker-add-title">${g(s(`companions.addSectionTitle`))}</div>

                <div class="companion-picker-add-path">
                    <div class="companion-picker-add-path__text">
                        <div class="companion-picker-add-path__name">${g(s(`companions.addPathFriendTitle`))}</div>
                        <div class="companion-picker-add-path__hint">${g(s(`companions.addPathFriendHint`))}</div>
                    </div>
                    <button type="button" id="companionPickerAddFriendBtn" class="companion-picker-add-section__friend-btn">
                        <span style="display:inline-flex; align-items:center;">${h(`user`,{size:16})}</span>
                        <span>${g(s(`companions.addFriendBtn`))}</span>
                    </button>
                </div>

                <div class="companion-picker-add-path">
                    <div class="companion-picker-add-path__text">
                        <div class="companion-picker-add-path__name">${g(s(`companions.addPathNameTitle`))}</div>
                        <div class="companion-picker-add-path__hint">${g(s(`companions.addPathNameHint`))}</div>
                    </div>
                    <form id="companionPickerAddForm" class="companion-picker-add-form" style="margin-bottom: 0;">
                        <input type="text" id="companionPickerAddInput" class="companion-picker-add-form__input" placeholder="${g(s(`companions.addInputPlaceholder`))}" autocomplete="off" maxlength="200">
                        <button type="submit" class="companion-picker-add-form__btn">${g(s(`companions.addBtn`))}</button>
                    </form>
                </div>
            </div>

            <!-- Friend picker (hidden by default) — appears when "Add a
                 friend" is clicked, listing accepted friends not already
                 on this trip. Pick one + role → adds to trip + invites. -->
            <div id="companionPickerFriendSheet" class="companion-picker-friend-sheet" hidden>
                <div class="companion-picker-friend-sheet__header">
                    <strong id="companionPickerFriendSheetTitle">${g(s(`companions.friendSheetTitle`))}</strong>
                    <button type="button" id="companionPickerFriendCancel" class="btn-x-bare" title="${g(s(`companions.rowCloseTitle`))}">✕</button>
                </div>
                <div id="companionPickerFriendList" class="companion-picker-friend-sheet__list">
                    <p style="text-align:center; color: rgba(0,0,0,0.45); padding: var(--space-4); margin: 0;">${g(s(`companions.friendSheetLoading`))}</p>
                </div>
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="companionPickerCloseBtn" class="btn-primary" style="flex: 1; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">${g(s(`companions.doneBtn`))}</button>
            </div>
        `}),I=v(P,`#companionPickerList`),R=v(P,`#companionPickerFriendSheet`),z=v(P,`#companionPickerFriendList`),B=v(P,`#companionPickerFriendSheetTitle`),V=v(P,`#companionPickerAddInput`),H=()=>{I.innerHTML=N()},U=()=>{let e=R.dataset.linkTargetName,t=new Set((l.companions||[]).map(e=>e.linkedUserId).filter(Boolean)),n=A.filter(e=>e.id!==d&&!t.has(e.id)),r=e&&d?`
            <div class="companion-row friend-pick-row picker-self-row">
                ${o.user?.picture?`<img src="${g(o.user.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">`:``}
                <span class="companion-row__name">${g(o.user?.name||s(`companions.pillYouText`))}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${g(s(`companions.pillYouText`))}</span>
                <button type="button" class="btn-link-action picker-link-self-btn">${g(s(`companions.linkMeBtn`))}</button>
            </div>`:``;if(n.length===0&&!r){z.innerHTML=`<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-4); margin: 0;">
                ${g(s(`companions.friendSheetEmpty`))}
            </p>`;return}z.innerHTML=r+n.map(e=>`
            <div class="companion-row friend-pick-row picker-friend-row" data-friend-id="${g(e.id)}" data-friend-name="${g(e.name)}">
                <img src="${g(e.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">
                <span class="companion-row__name">${g(e.name)}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${g(e.email)}</span>
                <select class="companion-row__role-select picker-friend-role-select">
                    <option value="${y}" selected>${g(s(`companions.roleRelaxer`))}</option>
                    <option value="${x}">${g(s(`companions.roleBudgeteer`))}</option>
                    <option value="${C}">${g(s(`companions.rolePlanner`))}</option>
                </select>
                <button type="button" class="btn-link-action picker-friend-add-btn">${g(s(`companions.friendAddBtn`))}</button>
            </div>
        `).join(``)};v(P,`#companionPickerCloseBtn`).onclick=()=>{F(),c(`state:changed`)},v(P,`#companionPickerFriendCancel`).onclick=()=>{R.hidden=!0},v(P,`#companionPickerAddFriendBtn`).onclick=async()=>{delete R.dataset.linkTargetName,B&&(B.textContent=s(`companions.friendSheetTitle`)),R.hidden=!1,A=await w(),U()},v(P,`#companionPickerAddForm`).onsubmit=e=>{e.preventDefault();let t=V.value.trim();if(t){if(E(l,t)){f(s(`companions.addDuplicate`,{name:t}),`info`),V.value=``,V.focus();return}i(l,t),c(`state:changed`),n(l),V.value=``,H()}},P.addEventListener(`click`,e=>{(async()=>{let o=e.target;if(!o)return;let m=o.closest(`.picker-remove-btn`);if(m?.dataset.name){let e=m.dataset.name,i=E(l,e);if(!i||i.linkedUserId&&i.linkedUserId===d)return;let a=()=>{r(l,e),c(`state:changed`),n(l),i.linkedUserId&&_(l.id,i.linkedUserId),H()},{balances:o}=D(l),f=o[e]??0;if(Math.abs(f)>.01){let n=t();p({title:s(`companions.removeWithBalanceTitle`),message:f>0?s(`companions.removeWithBalanceOwed`,{name:e,amount:u(f,n)}):s(`companions.removeWithBalanceOwes`,{name:e,amount:u(Math.abs(f),n)}),confirmText:s(`common.remove`),onConfirm:a})}else i.linkedUserId?p({title:s(`companions.removeConfirmTitle`),message:s(`companions.removeConfirmBody`,{name:e}),confirmText:s(`common.remove`),onConfirm:a}):a();return}let h=o.closest(`.picker-unlink-btn`);if(h?.dataset.name){let e=E(l,h.dataset.name);e&&delete e.linkedUserId,c(`state:changed`),n(l),H();return}let g=o.closest(`.picker-cancel-invite-btn`);if(g?.dataset.name){let e=g.dataset.name,t=E(l,e);if(!t||!t.linkedUserId||t.linkedUserId===d)return;let r=t.linkedUserId;p({title:s(`companions.cancelInviteTitle`),message:s(`companions.cancelInviteBody`,{name:e}),confirmText:s(`companions.cancelInviteConfirm`),onConfirm:()=>{delete t.linkedUserId,c(`state:changed`),n(l),_(l.id,r),H()}});return}let v=o.closest(`.picker-link-btn`);if(v?.dataset.name){R.hidden=!1,R.dataset.linkTargetName=v.dataset.name,B&&(B.textContent=s(`companions.linkSheetTitle`)),A=await w(),U();return}if(o.closest(`.picker-link-self-btn`)){let e=R.dataset.linkTargetName;if(e&&d){let t=E(l,e);t&&(t.linkedUserId=d,a(l,d,t.name,O)),delete R.dataset.linkTargetName,c(`state:changed`),n(l),R.hidden=!0,H()}return}let y=o.closest(`.picker-friend-add-btn`);if(y){let e=y.closest(`.picker-friend-row`);if(!e?.dataset.friendId)return;let t=e.dataset.friendId,r=e.dataset.friendName||`Friend`,o=e.querySelector(`.picker-friend-role-select`)?.value||`relaxer`,u=await T(l.id,t,o);if(!u.ok){f(u.status===409?s(`companions.inviteRoleConflict`,{name:r}):u.status===404?s(`companions.inviteUnavailable`,{name:r}):s(`companions.inviteFailed`,{name:r}));return}let d=R.dataset.linkTargetName,p=r;if(d){let e=E(l,d);e?(e.linkedUserId=t,p=e.name):p=i(l,r,t).name,delete R.dataset.linkTargetName}else{let e=E(l,r);e&&!e.linkedUserId?(e.linkedUserId=t,p=e.name):p=i(l,r,t).name}a(l,t,p,O),c(`state:changed`),n(l),R.hidden=!0,H(),f(s(`companions.invitedToast`,{name:r,role:j(o)}),`success`)}})()})},L=e=>{let t=o.trips.find(t=>t.id===e);if(!t)return;let n=t.members||[],r=n.find(e=>e.userId===t.ownerId),i=n.filter(e=>e.userId!==t.ownerId),a=e=>e===`planner`?s(`companions.rolePlanner`):e===`budgeteer`?s(`companions.roleBudgeteer`):e===`relaxer`?s(`companions.roleRelaxer`):e,c=(e,t)=>`
        <div class="companion-row" style="cursor: default;">
            ${e.picture?`<img src="${g(e.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">`:``}
            <span class="companion-row__name">${g(e.name||e.userId)}</span>
            <span class="companion-link-pill ${t?`companion-link-pill--linked`:`companion-link-pill--pending`}">
                ${g(t?s(`companions.membersOwnerBadge`):a(e.role))}
            </span>
        </div>
    `,{root:l,close:u}=S({variant:`glass-light`,cardStyle:`width: min(460px, calc(100vw - 24px)); max-width: 100%; max-height: 85vh; display: flex; flex-direction: column;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${g(s(`companions.membersTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                ${s(`companions.membersIntro`,{trip:g(t.name),role:g(a(t.myRole||`relaxer`))})}
            </p>

            <div style="display: flex; flex-direction: column; gap: var(--space-2); overflow-y: auto; padding: var(--space-1); margin-bottom: var(--space-5); flex: 1; min-height: 0;">
                ${r?c(r,!0):``}
                ${i.map(e=>c(e,!1)).join(``)}
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="tripMembersCloseBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">${g(s(`companions.closeBtn`))}</button>
            </div>
        `});v(l,`#tripMembersCloseBtn`).onclick=()=>u()},R=()=>{if(!o.activeTripId){f(s(`modals.addDayErrorNoTrip`));return}let e=(o.tripDays||[]).filter(e=>e.tripId===o.activeTripId).sort((e,t)=>e.dayNumber-t.dayNumber),t=e.filter(e=>e.dayNumber>0),n=(t.length>0?t[t.length-1].dayNumber:0)+1,r=``;if(e.length>0){let t=e[e.length-1];if(t.date){let e=new Date(t.date+`T00:00:00Z`);e.setUTCDate(e.getUTCDate()+1),r=e.toISOString().split(`T`)[0]??``}}let{root:i,close:a}=S({variant:`glass-light`,cardStyle:`width: 400px;`,innerHTML:`
            <div style="display: flex; align-items: center; justify-content: center; gap: var(--space-3); margin-bottom: var(--space-5);">
                <div style="background: var(--accent-blue); color: white; width: 28px; height: 28px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: var(--font-base);">${n}</div>
                <h2 class="card-title" style="font-size: var(--font-3xl); margin: 0; color: #000000; letter-spacing: -0.06em; font-weight: 800; text-align: center;">${g(s(`modals.addDayTitle`))}</h2>
            </div>
            <form id="addDayForm" style="display: flex; flex-direction: column; width: 100%;">
                <div class="mb-4">
                    <label class="form-label text-black/50" for="dayName">${g(s(`modals.addDayLabelWhere`))}</label>
                    <input type="text" id="dayName" class="glass-input-modal mdl-btn-dark" value="${g(s(`tripMedia.dayBucketDay`,{n}))}" placeholder="${g(s(`modals.addDayPlaceholderWhere`))}" required autofocus>
                </div>
                <div style="margin-bottom: var(--space-6);">
                    <label class="form-label text-black/50" for="dayDate">${g(s(`modals.addDayLabelDate`))} ${r?g(s(`modals.addDayDateAuto`)):``}</label>
                    <input type="date" id="dayDate" class="glass-input-modal mdl-btn-dark" value="${r}" required>
                </div>
                <div style="display: flex; gap: var(--space-2); width: 100%;">
                    <button type="submit" class="btn-primary flex-[2]">${g(s(`modals.addDayConfirmBtn`))}</button>
                    <button type="button" id="cancelDayBtn" class="btn-ghost" style="flex: 1; background: rgba(0,0,0,0.05); color: #000; border: none;">${g(s(`modals.addDayCancelBtn`))}</button>
                </div>
            </form>
        `}),u=o.activeTripId;v(i,`#cancelDayBtn`).onclick=()=>a(),v(i,`#addDayForm`).onsubmit=async e=>{e.preventDefault();let t={id:b(),tripId:u,name:v(i,`#dayName`).value,date:v(i,`#dayDate`).value,dayNumber:n,photos:[],notes:``,plan:{morning:``,afternoon:``,evening:``}};o.tripDays.push(t),c(`state:changed`);let r=await d(t);if(r&&!r.ok){let e=r.status||`no-response`,n=r.body?.error||``;f(s(`modals.addDayErrorServerSave`,{status:n?`${e} · ${n}`:String(e)})),console.error(`[upsertDay] failed`,{dayId:t.id,status:e,body:r.body})}a(),l(`home`)}},z=e({importTripFromFile:()=>M,openAddDayModal:()=>R,openCompanionPickerModal:()=>I,openDownloadChooserModal:()=>j,openEditTripModal:()=>k,openNewTripModal:()=>O,openPdfExportModal:()=>A,openShareChooserModal:()=>F,openShareTripModal:()=>N,openTripInviteResponseModal:()=>P});export{L as i,R as n,I as r,z as t};
//# sourceMappingURL=modals-D4BLHDDm.js.map