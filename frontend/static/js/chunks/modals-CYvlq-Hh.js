import{n as e}from"./rolldown-runtime-Kw0j5LDr.js";import{$t as t,Dn as n,En as r,Fn as i,Hn as a,I as o,In as s,J as c,Jt as l,Kn as u,P as d,Qn as f,Tt as p,Un as m,Yn as h,Yt as g,_n as _,gn as v,qn as y,qt as b,rt as x,tt as S,w as C,wn as w,xn as T,yn as E}from"../app.bundle.js";import{i as D}from"./balances-BDRN3L4m.js";import{n as O,t as k}from"./trip-Dthois_-.js";import{i as A,n as j,t as M}from"./tripExport-BPxt6iED.js";import{n as N,r as P,t as F}from"./share-6dbJBIpr.js";var I=e=>{let d=a.trips.find(t=>t.id===e);if(!d)return;if(!t(d)){L(e);return}Array.isArray(d.companions)||(d.companions=[]);let p=a.user?.id,w=new Set(a.expenses.filter(t=>t.tripId===e).flatMap(e=>[e.who,...Object.keys(e.splits||{})]).filter(Boolean).map(e=>String(e).toLocaleLowerCase())),O=t=>{let n=t.toLocaleLowerCase();return w.has(n)?!0:(a.budgets||[]).some(t=>t.tripId===e&&(t.user||``).toLocaleLowerCase()===n)},k=new Map((d.members||[]).map(e=>[e.userId,e])),A=[],j=e=>e===`planner`?C(`companions.rolePlanner`):e===`budgeteer`?C(`companions.roleBudgeteer`):e===`relaxer`?C(`companions.roleRelaxer`):e,M=e=>{let t=O(e.name),n=e.linkedUserId,r=!!n&&n===p,i=n?k.get(n):null,a=``;a=r?`<span class="companion-link-pill companion-link-pill--linked" title="${T(C(`companions.pillYouText`))}">${T(C(`companions.pillYouText`))}</span>`:i?`<span class="companion-link-pill companion-link-pill--linked" title="${T(C(`companions.pillLinkedTitle`))}">${T(j(i.role))}</span>`:n?`<span class="companion-link-pill companion-link-pill--pending" title="${T(C(`companions.pillPendingTitle`))}">${T(C(`companions.pillPendingText`))}</span>`:`<span class="companion-link-pill companion-link-pill--companion">${T(C(`companions.pillUnlinkedText`))}</span>`;let o=``;n?r?o=`<button type="button" class="btn-link-action picker-unlink-btn" data-name="${T(e.name)}">${T(C(`companions.rowUnlinkBtn`))}</button>`:i||(o=`<button type="button" class="btn-link-action picker-cancel-invite-btn" data-name="${T(e.name)}">${T(C(`companions.rowCancelInviteBtn`))}</button>`):o=`<button type="button" class="btn-link-action picker-link-btn" data-name="${T(e.name)}">${T(C(`companions.rowLinkBtn`))}</button>`;let s=r?``:t?`<span class="companion-row__lock" title="${T(C(`companions.rowLockTitle`))}" style="display:inline-flex; align-items:center;">${E(`lock`,{size:14})}</span>`:`<button type="button" class="btn-x-bare picker-remove-btn" data-name="${T(e.name)}" title="${T(C(`companions.rowRemoveTitle`))}">✕</button>`;return`
            <div class="companion-row" data-name="${T(e.name)}">
                <span class="companion-row__name">${T(e.name)}</span>
                ${a}
                <span style="flex:1;"></span>
                ${o}
                ${s}
            </div>
        `},N=()=>{let e=d.companions||[];return e.length===0?`<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-6); margin: 0;">
                ${T(C(`companions.pickerEmpty`))}
            </p>`:e.map(M).join(``)},{root:P,close:F}=_({variant:`glass-light`,cardStyle:`width: min(520px, calc(100vw - 24px)); max-width: 100%; max-height: 85vh; display: flex; flex-direction: column;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${T(C(`companions.pickerTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                ${C(`companions.pickerIntro`,{trip:T(d.name)})}
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
                <div class="companion-picker-add-title">${T(C(`companions.addSectionTitle`))}</div>

                <div class="companion-picker-add-path">
                    <div class="companion-picker-add-path__text">
                        <div class="companion-picker-add-path__name">${T(C(`companions.addPathFriendTitle`))}</div>
                        <div class="companion-picker-add-path__hint">${T(C(`companions.addPathFriendHint`))}</div>
                    </div>
                    <button type="button" id="companionPickerAddFriendBtn" class="companion-picker-add-section__friend-btn">
                        <span style="display:inline-flex; align-items:center;">${E(`user`,{size:16})}</span>
                        <span>${T(C(`companions.addFriendBtn`))}</span>
                    </button>
                </div>

                <div class="companion-picker-add-path">
                    <div class="companion-picker-add-path__text">
                        <div class="companion-picker-add-path__name">${T(C(`companions.addPathNameTitle`))}</div>
                        <div class="companion-picker-add-path__hint">${T(C(`companions.addPathNameHint`))}</div>
                    </div>
                    <form id="companionPickerAddForm" class="companion-picker-add-form" style="margin-bottom: 0;">
                        <input type="text" id="companionPickerAddInput" class="companion-picker-add-form__input" placeholder="${T(C(`companions.addInputPlaceholder`))}" autocomplete="off" maxlength="200">
                        <button type="submit" class="companion-picker-add-form__btn">${T(C(`companions.addBtn`))}</button>
                    </form>
                </div>
            </div>

            <!-- Friend picker (hidden by default) — appears when "Add a
                 friend" is clicked, listing accepted friends not already
                 on this trip. Pick one + role → adds to trip + invites. -->
            <div id="companionPickerFriendSheet" class="companion-picker-friend-sheet" hidden>
                <div class="companion-picker-friend-sheet__header">
                    <strong id="companionPickerFriendSheetTitle">${T(C(`companions.friendSheetTitle`))}</strong>
                    <button type="button" id="companionPickerFriendCancel" class="btn-x-bare" title="${T(C(`companions.rowCloseTitle`))}">✕</button>
                </div>
                <div id="companionPickerFriendList" class="companion-picker-friend-sheet__list">
                    <p style="text-align:center; color: rgba(0,0,0,0.45); padding: var(--space-4); margin: 0;">${T(C(`companions.friendSheetLoading`))}</p>
                </div>
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="companionPickerCloseBtn" class="btn-primary" style="flex: 1; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">${T(C(`companions.doneBtn`))}</button>
            </div>
        `}),I=r(P,`#companionPickerList`),R=r(P,`#companionPickerFriendSheet`),z=r(P,`#companionPickerFriendList`),B=r(P,`#companionPickerFriendSheetTitle`),V=r(P,`#companionPickerAddInput`),H=()=>{I.innerHTML=N()},U=()=>{let e=R.dataset.linkTargetName,t=new Set((d.companions||[]).map(e=>e.linkedUserId).filter(Boolean)),n=A.filter(e=>e.id!==p&&!t.has(e.id)),r=e&&p?`
            <div class="companion-row friend-pick-row picker-self-row">
                ${a.user?.picture?`<img src="${T(a.user.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">`:``}
                <span class="companion-row__name">${T(a.user?.name||C(`companions.pillYouText`))}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${T(C(`companions.pillYouText`))}</span>
                <button type="button" class="btn-link-action picker-link-self-btn">${T(C(`companions.linkMeBtn`))}</button>
            </div>`:``;if(n.length===0&&!r){z.innerHTML=`<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-4); margin: 0;">
                ${T(C(`companions.friendSheetEmpty`))}
            </p>`;return}z.innerHTML=r+n.map(e=>`
            <div class="companion-row friend-pick-row picker-friend-row" data-friend-id="${T(e.id)}" data-friend-name="${T(e.name)}">
                <img src="${T(e.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">
                <span class="companion-row__name">${T(e.name)}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${T(e.email)}</span>
                <select class="companion-row__role-select picker-friend-role-select">
                    <option value="${g}" selected>${T(C(`companions.roleRelaxer`))}</option>
                    <option value="${b}">${T(C(`companions.roleBudgeteer`))}</option>
                    <option value="${l}">${T(C(`companions.rolePlanner`))}</option>
                </select>
                <button type="button" class="btn-link-action picker-friend-add-btn">${T(C(`companions.friendAddBtn`))}</button>
            </div>
        `).join(``)};r(P,`#companionPickerCloseBtn`).onclick=()=>{F(),m(`state:changed`)},r(P,`#companionPickerFriendCancel`).onclick=()=>{R.hidden=!0},r(P,`#companionPickerAddFriendBtn`).onclick=async()=>{delete R.dataset.linkTargetName,B&&(B.textContent=C(`companions.friendSheetTitle`)),R.hidden=!1,A=await c(),U()},r(P,`#companionPickerAddForm`).onsubmit=e=>{e.preventDefault();let t=V.value.trim();if(t){if(h(d,t)){n(C(`companions.addDuplicate`,{name:t}),`info`),V.value=``,V.focus();return}u(d,t),m(`state:changed`),o(d),V.value=``,H()}},P.addEventListener(`click`,e=>{(async()=>{let t=e.target;if(!t)return;let r=t.closest(`.picker-remove-btn`);if(r?.dataset.name){let e=r.dataset.name,t=h(d,e);if(!t||t.linkedUserId&&t.linkedUserId===p)return;let n=()=>{f(d,e),m(`state:changed`),o(d),t.linkedUserId&&x(d.id,t.linkedUserId),H()},{balances:a}=D(d),c=a[e]??0;if(Math.abs(c)>.01){let t=s();v({title:C(`companions.removeWithBalanceTitle`),message:c>0?C(`companions.removeWithBalanceOwed`,{name:e,amount:i(c,t)}):C(`companions.removeWithBalanceOwes`,{name:e,amount:i(Math.abs(c),t)}),confirmText:C(`common.remove`),onConfirm:n})}else t.linkedUserId?v({title:C(`companions.removeConfirmTitle`),message:C(`companions.removeConfirmBody`,{name:e}),confirmText:C(`common.remove`),onConfirm:n}):n();return}let a=t.closest(`.picker-unlink-btn`);if(a?.dataset.name){let e=h(d,a.dataset.name);e&&delete e.linkedUserId,m(`state:changed`),o(d),H();return}let l=t.closest(`.picker-cancel-invite-btn`);if(l?.dataset.name){let e=l.dataset.name,t=h(d,e);if(!t||!t.linkedUserId||t.linkedUserId===p)return;let n=t.linkedUserId;v({title:C(`companions.cancelInviteTitle`),message:C(`companions.cancelInviteBody`,{name:e}),confirmText:C(`companions.cancelInviteConfirm`),onConfirm:()=>{delete t.linkedUserId,m(`state:changed`),o(d),x(d.id,n),H()}});return}let g=t.closest(`.picker-link-btn`);if(g?.dataset.name){R.hidden=!1,R.dataset.linkTargetName=g.dataset.name,B&&(B.textContent=C(`companions.linkSheetTitle`)),A=await c(),U();return}if(t.closest(`.picker-link-self-btn`)){let e=R.dataset.linkTargetName;if(e&&p){let t=h(d,e);t&&(t.linkedUserId=p,y(d,p,t.name,O)),delete R.dataset.linkTargetName,m(`state:changed`),o(d),R.hidden=!0,H()}return}let _=t.closest(`.picker-friend-add-btn`);if(_){let e=_.closest(`.picker-friend-row`);if(!e?.dataset.friendId)return;let t=e.dataset.friendId,r=e.dataset.friendName||`Friend`,i=e.querySelector(`.picker-friend-role-select`)?.value||`relaxer`,a=await S(d.id,t,i);if(!a.ok){n(a.status===409?C(`companions.inviteRoleConflict`,{name:r}):a.status===404?C(`companions.inviteUnavailable`,{name:r}):C(`companions.inviteFailed`,{name:r}));return}let s=R.dataset.linkTargetName,c=r;if(s){let e=h(d,s);e?(e.linkedUserId=t,c=e.name):c=u(d,r,t).name,delete R.dataset.linkTargetName}else{let e=h(d,r);e&&!e.linkedUserId?(e.linkedUserId=t,c=e.name):c=u(d,r,t).name}y(d,t,c,O),m(`state:changed`),o(d),R.hidden=!0,H(),n(C(`companions.invitedToast`,{name:r,role:j(i)}),`success`)}})()})},L=e=>{let t=a.trips.find(t=>t.id===e);if(!t)return;let n=t.members||[],i=n.find(e=>e.userId===t.ownerId),o=n.filter(e=>e.userId!==t.ownerId),s=e=>e===`planner`?C(`companions.rolePlanner`):e===`budgeteer`?C(`companions.roleBudgeteer`):e===`relaxer`?C(`companions.roleRelaxer`):e,c=(e,t)=>`
        <div class="companion-row" style="cursor: default;">
            ${e.picture?`<img src="${T(e.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">`:``}
            <span class="companion-row__name">${T(e.name||e.userId)}</span>
            <span class="companion-link-pill ${t?`companion-link-pill--linked`:`companion-link-pill--pending`}">
                ${T(t?C(`companions.membersOwnerBadge`):s(e.role))}
            </span>
        </div>
    `,{root:l,close:u}=_({variant:`glass-light`,cardStyle:`width: min(460px, calc(100vw - 24px)); max-width: 100%; max-height: 85vh; display: flex; flex-direction: column;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${T(C(`companions.membersTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                ${C(`companions.membersIntro`,{trip:T(t.name),role:T(s(t.myRole||`relaxer`))})}
            </p>

            <div style="display: flex; flex-direction: column; gap: var(--space-2); overflow-y: auto; padding: var(--space-1); margin-bottom: var(--space-5); flex: 1; min-height: 0;">
                ${i?c(i,!0):``}
                ${o.map(e=>c(e,!1)).join(``)}
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="tripMembersCloseBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">${T(C(`companions.closeBtn`))}</button>
            </div>
        `});r(l,`#tripMembersCloseBtn`).onclick=()=>u()},R=()=>{if(!a.activeTripId){n(C(`modals.addDayErrorNoTrip`));return}let e=(a.tripDays||[]).filter(e=>e.tripId===a.activeTripId).sort((e,t)=>e.dayNumber-t.dayNumber),t=e.filter(e=>e.dayNumber>0),i=(t.length>0?t[t.length-1].dayNumber:0)+1,o=``;if(e.length>0){let t=e[e.length-1];if(t.date){let e=new Date(t.date+`T00:00:00Z`);e.setUTCDate(e.getUTCDate()+1),o=e.toISOString().split(`T`)[0]??``}}let{root:s,close:c}=_({variant:`glass-light`,cardStyle:`width: 400px;`,innerHTML:`
            <div style="display: flex; align-items: center; justify-content: center; gap: var(--space-3); margin-bottom: var(--space-5);">
                <div style="background: var(--accent-blue); color: white; width: 28px; height: 28px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: var(--font-base);">${i}</div>
                <h2 class="card-title" style="font-size: var(--font-3xl); margin: 0; color: #000000; letter-spacing: -0.06em; font-weight: 800; text-align: center;">${T(C(`modals.addDayTitle`))}</h2>
            </div>
            <form id="addDayForm" style="display: flex; flex-direction: column; width: 100%;">
                <div class="mb-4">
                    <label class="form-label text-black/50" for="dayName">${T(C(`modals.addDayLabelWhere`))}</label>
                    <input type="text" id="dayName" class="glass-input-modal mdl-btn-dark" value="${T(C(`tripMedia.dayBucketDay`,{n:i}))}" placeholder="${T(C(`modals.addDayPlaceholderWhere`))}" required autofocus>
                </div>
                <div style="margin-bottom: var(--space-6);">
                    <label class="form-label text-black/50" for="dayDate">${T(C(`modals.addDayLabelDate`))} ${o?T(C(`modals.addDayDateAuto`)):``}</label>
                    <input type="date" id="dayDate" class="glass-input-modal mdl-btn-dark" value="${o}" required>
                </div>
                <div style="display: flex; gap: var(--space-2); width: 100%;">
                    <button type="submit" class="btn-primary flex-[2]">${T(C(`modals.addDayConfirmBtn`))}</button>
                    <button type="button" id="cancelDayBtn" class="btn-ghost" style="flex: 1; background: rgba(0,0,0,0.05); color: #000; border: none;">${T(C(`modals.addDayCancelBtn`))}</button>
                </div>
            </form>
        `}),l=a.activeTripId;r(s,`#cancelDayBtn`).onclick=()=>c(),r(s,`#addDayForm`).onsubmit=async e=>{e.preventDefault();let t={id:w(),tripId:l,name:r(s,`#dayName`).value,date:r(s,`#dayDate`).value,dayNumber:i,photos:[],notes:``,plan:{morning:``,afternoon:``,evening:``}};a.tripDays.push(t),m(`state:changed`);let o=await d(t);if(o&&!o.ok){let e=o.status||`no-response`,r=o.body?.error||``;n(C(`modals.addDayErrorServerSave`,{status:r?`${e} · ${r}`:String(e)})),console.error(`[upsertDay] failed`,{dayId:t.id,status:e,body:o.body})}c(),p(`home`)}},z=e({importTripFromFile:()=>M,openAddDayModal:()=>R,openCompanionPickerModal:()=>I,openDownloadChooserModal:()=>j,openEditTripModal:()=>k,openNewTripModal:()=>O,openPdfExportModal:()=>A,openShareChooserModal:()=>F,openShareTripModal:()=>N,openTripInviteResponseModal:()=>P});export{L as i,R as n,I as r,z as t};
//# sourceMappingURL=modals-CYvlq-Hh.js.map