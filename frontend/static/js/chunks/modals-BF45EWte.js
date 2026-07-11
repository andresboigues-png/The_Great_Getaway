import{n as e}from"./rolldown-runtime-Kw0j5LDr.js";import{$n as t,$t as n,An as r,Bn as i,En as a,I as o,J as s,Kn as c,P as l,Qt as u,Sn as d,Tt as f,Xn as p,Zn as m,en as h,in as g,jn as _,kn as v,nr as y,qn as b,rt as x,tt as S,w as C,wn as w,xn as T,zn as E}from"../app.bundle.js";import{i as D}from"./balances-BjiT9bRd.js";import{n as O,t as k}from"./trip-_vpZppLo.js";import{i as A,n as j,t as M}from"./tripExport-Cj2UYv10.js";import{n as N,r as P,t as F}from"./share-BXOZgRmJ.js";var I=e=>{let l=c.trips.find(t=>t.id===e);if(!l)return;if(!g(l)){L(e);return}Array.isArray(l.companions)||(l.companions=[]);let f=c.user?.id,v=new Set(c.expenses.filter(t=>t.tripId===e).flatMap(e=>[e.who,...Object.keys(e.splits||{})]).filter(Boolean).map(e=>String(e).toLocaleLowerCase())),O=t=>{let n=t.toLocaleLowerCase();return v.has(n)?!0:(c.budgets||[]).some(t=>t.tripId===e&&(t.user||``).toLocaleLowerCase()===n)},k=new Map((l.members||[]).map(e=>[e.userId,e])),A=[],j=e=>e===`planner`?C(`companions.rolePlanner`):e===`budgeteer`?C(`companions.roleBudgeteer`):e===`relaxer`?C(`companions.roleRelaxer`):e,M=e=>{let t=O(e.name),n=e.linkedUserId,r=!!n&&n===f,i=n?k.get(n):null,o=``;o=r?`<span class="companion-link-pill companion-link-pill--linked" title="${a(C(`companions.pillYouText`))}">${a(C(`companions.pillYouText`))}</span>`:i?`<span class="companion-link-pill companion-link-pill--linked" title="${a(C(`companions.pillLinkedTitle`))}">${a(j(i.role))}</span>`:n?`<span class="companion-link-pill companion-link-pill--pending" title="${a(C(`companions.pillPendingTitle`))}">${a(C(`companions.pillPendingText`))}</span>`:`<span class="companion-link-pill companion-link-pill--companion">${a(C(`companions.pillUnlinkedText`))}</span>`;let s=``;n?r?s=`<button type="button" class="btn-link-action picker-unlink-btn" data-name="${a(e.name)}">${a(C(`companions.rowUnlinkBtn`))}</button>`:i||(s=`<button type="button" class="btn-link-action picker-cancel-invite-btn" data-name="${a(e.name)}">${a(C(`companions.rowCancelInviteBtn`))}</button>`):s=`<button type="button" class="btn-link-action picker-link-btn" data-name="${a(e.name)}">${a(C(`companions.rowLinkBtn`))}</button>`;let c=r?``:t?`<span class="companion-row__lock" title="${a(C(`companions.rowLockTitle`))}" style="display:inline-flex; align-items:center;">${w(`lock`,{size:14})}</span>`:`<button type="button" class="btn-x-bare picker-remove-btn" data-name="${a(e.name)}" title="${a(C(`companions.rowRemoveTitle`))}">✕</button>`;return`
            <div class="companion-row" data-name="${a(e.name)}">
                <span class="companion-row__name">${a(e.name)}</span>
                ${o}
                <span style="flex:1;"></span>
                ${s}
                ${c}
            </div>
        `},N=()=>{let e=l.companions||[];return e.length===0?`<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-6); margin: 0;">
                ${a(C(`companions.pickerEmpty`))}
            </p>`:e.map(M).join(``)},{root:P,close:F}=d({variant:`glass-light`,cardStyle:`width: min(520px, calc(100vw - 24px)); max-width: 100%; max-height: 85vh; display: flex; flex-direction: column;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${a(C(`companions.pickerTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                ${C(`companions.pickerIntro`,{trip:a(l.name)})}
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
                <div class="companion-picker-add-title">${a(C(`companions.addSectionTitle`))}</div>

                <div class="companion-picker-add-path">
                    <div class="companion-picker-add-path__text">
                        <div class="companion-picker-add-path__name">${a(C(`companions.addPathFriendTitle`))}</div>
                        <div class="companion-picker-add-path__hint">${a(C(`companions.addPathFriendHint`))}</div>
                    </div>
                    <button type="button" id="companionPickerAddFriendBtn" class="companion-picker-add-section__friend-btn">
                        <span style="display:inline-flex; align-items:center;">${w(`user`,{size:16})}</span>
                        <span>${a(C(`companions.addFriendBtn`))}</span>
                    </button>
                </div>

                <div class="companion-picker-add-path">
                    <div class="companion-picker-add-path__text">
                        <div class="companion-picker-add-path__name">${a(C(`companions.addPathNameTitle`))}</div>
                        <div class="companion-picker-add-path__hint">${a(C(`companions.addPathNameHint`))}</div>
                    </div>
                    <form id="companionPickerAddForm" class="companion-picker-add-form" style="margin-bottom: 0;">
                        <input type="text" id="companionPickerAddInput" class="companion-picker-add-form__input" placeholder="${a(C(`companions.addInputPlaceholder`))}" autocomplete="off" maxlength="200">
                        <button type="submit" class="companion-picker-add-form__btn">${a(C(`companions.addBtn`))}</button>
                    </form>
                </div>
            </div>

            <!-- Friend picker (hidden by default) — appears when "Add a
                 friend" is clicked, listing accepted friends not already
                 on this trip. Pick one + role → adds to trip + invites. -->
            <div id="companionPickerFriendSheet" class="companion-picker-friend-sheet" hidden>
                <div class="companion-picker-friend-sheet__header">
                    <strong id="companionPickerFriendSheetTitle">${a(C(`companions.friendSheetTitle`))}</strong>
                    <button type="button" id="companionPickerFriendCancel" class="btn-x-bare" title="${a(C(`companions.rowCloseTitle`))}">✕</button>
                </div>
                <div id="companionPickerFriendList" class="companion-picker-friend-sheet__list">
                    <p style="text-align:center; color: rgba(0,0,0,0.45); padding: var(--space-4); margin: 0;">${a(C(`companions.friendSheetLoading`))}</p>
                </div>
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="companionPickerCloseBtn" class="btn-primary" style="flex: 1; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">${a(C(`companions.doneBtn`))}</button>
            </div>
        `}),I=r(P,`#companionPickerList`),R=r(P,`#companionPickerFriendSheet`),z=r(P,`#companionPickerFriendList`),B=r(P,`#companionPickerFriendSheetTitle`),V=r(P,`#companionPickerAddInput`),H=()=>{I.innerHTML=N()},U=()=>{let e=R.dataset.linkTargetName,t=new Set((l.companions||[]).map(e=>e.linkedUserId).filter(Boolean)),r=A.filter(e=>e.id!==f&&!t.has(e.id)),i=e&&f?`
            <div class="companion-row friend-pick-row picker-self-row">
                ${c.user?.picture?`<img src="${a(c.user.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">`:``}
                <span class="companion-row__name">${a(c.user?.name||C(`companions.pillYouText`))}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${a(C(`companions.pillYouText`))}</span>
                <button type="button" class="btn-link-action picker-link-self-btn">${a(C(`companions.linkMeBtn`))}</button>
            </div>`:``;if(r.length===0&&!i){z.innerHTML=`<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-4); margin: 0;">
                ${a(C(`companions.friendSheetEmpty`))}
            </p>`;return}z.innerHTML=i+r.map(e=>`
            <div class="companion-row friend-pick-row picker-friend-row" data-friend-id="${a(e.id)}" data-friend-name="${a(e.name)}">
                <img src="${a(e.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">
                <span class="companion-row__name">${a(e.name)}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${a(e.email)}</span>
                <select class="companion-row__role-select picker-friend-role-select">
                    <option value="${h}" selected>${a(C(`companions.roleRelaxer`))}</option>
                    <option value="${u}">${a(C(`companions.roleBudgeteer`))}</option>
                    <option value="${n}">${a(C(`companions.rolePlanner`))}</option>
                </select>
                <button type="button" class="btn-link-action picker-friend-add-btn">${a(C(`companions.friendAddBtn`))}</button>
            </div>
        `).join(``)};r(P,`#companionPickerCloseBtn`).onclick=()=>{F(),b(`state:changed`)},r(P,`#companionPickerFriendCancel`).onclick=()=>{R.hidden=!0},r(P,`#companionPickerAddFriendBtn`).onclick=async()=>{delete R.dataset.linkTargetName,B&&(B.textContent=C(`companions.friendSheetTitle`)),R.hidden=!1,A=await s(),U()},r(P,`#companionPickerAddForm`).onsubmit=e=>{e.preventDefault();let n=V.value.trim();if(n){if(t(l,n)){_(C(`companions.addDuplicate`,{name:n}),`info`),V.value=``,V.focus();return}p(l,n),b(`state:changed`),o(l),V.value=``,H()}},P.addEventListener(`click`,e=>{(async()=>{let n=e.target;if(!n)return;let r=n.closest(`.picker-remove-btn`);if(r?.dataset.name){let e=r.dataset.name,n=t(l,e);if(!n||n.linkedUserId&&n.linkedUserId===f)return;let a=()=>{y(l,e),b(`state:changed`),o(l),n.linkedUserId&&x(l.id,n.linkedUserId),H()},{balances:s}=D(l),c=s[e]??0;if(Math.abs(c)>.01){let t=i();T({title:C(`companions.removeWithBalanceTitle`),message:c>0?C(`companions.removeWithBalanceOwed`,{name:e,amount:E(c,t)}):C(`companions.removeWithBalanceOwes`,{name:e,amount:E(Math.abs(c),t)}),confirmText:C(`common.remove`),onConfirm:a})}else n.linkedUserId?T({title:C(`companions.removeConfirmTitle`),message:C(`companions.removeConfirmBody`,{name:e}),confirmText:C(`common.remove`),onConfirm:a}):a();return}let a=n.closest(`.picker-unlink-btn`);if(a?.dataset.name){let e=t(l,a.dataset.name);e&&delete e.linkedUserId,b(`state:changed`),o(l),H();return}let c=n.closest(`.picker-cancel-invite-btn`);if(c?.dataset.name){let e=c.dataset.name,n=t(l,e);if(!n||!n.linkedUserId||n.linkedUserId===f)return;let r=n.linkedUserId;T({title:C(`companions.cancelInviteTitle`),message:C(`companions.cancelInviteBody`,{name:e}),confirmText:C(`companions.cancelInviteConfirm`),onConfirm:()=>{delete n.linkedUserId,b(`state:changed`),o(l),x(l.id,r),H()}});return}let u=n.closest(`.picker-link-btn`);if(u?.dataset.name){R.hidden=!1,R.dataset.linkTargetName=u.dataset.name,B&&(B.textContent=C(`companions.linkSheetTitle`)),A=await s(),U();return}if(n.closest(`.picker-link-self-btn`)){let e=R.dataset.linkTargetName;if(e&&f){let n=t(l,e);n&&(n.linkedUserId=f,m(l,f,n.name,O)),delete R.dataset.linkTargetName,b(`state:changed`),o(l),R.hidden=!0,H()}return}let d=n.closest(`.picker-friend-add-btn`);if(d){let e=d.closest(`.picker-friend-row`);if(!e?.dataset.friendId)return;let n=e.dataset.friendId,r=e.dataset.friendName||`Friend`,i=e.querySelector(`.picker-friend-role-select`)?.value||`relaxer`,a=await S(l.id,n,i);if(!a.ok){_(a.status===409?C(`companions.inviteRoleConflict`,{name:r}):a.status===404?C(`companions.inviteUnavailable`,{name:r}):C(`companions.inviteFailed`,{name:r}));return}let s=R.dataset.linkTargetName,c=r;if(s){let e=t(l,s);e?(e.linkedUserId=n,c=e.name):c=p(l,r,n).name,delete R.dataset.linkTargetName}else{let e=t(l,r);e&&!e.linkedUserId?(e.linkedUserId=n,c=e.name):c=p(l,r,n).name}m(l,n,c,O),b(`state:changed`),o(l),R.hidden=!0,H(),_(C(`companions.invitedToast`,{name:r,role:j(i)}),`success`)}})()})},L=e=>{let t=c.trips.find(t=>t.id===e);if(!t)return;let n=t.members||[],i=n.find(e=>e.userId===t.ownerId),o=n.filter(e=>e.userId!==t.ownerId),s=e=>e===`planner`?C(`companions.rolePlanner`):e===`budgeteer`?C(`companions.roleBudgeteer`):e===`relaxer`?C(`companions.roleRelaxer`):e,l=(e,t)=>`
        <div class="companion-row" style="cursor: default;">
            ${e.picture?`<img src="${a(e.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">`:``}
            <span class="companion-row__name">${a(e.name||e.userId)}</span>
            <span class="companion-link-pill ${t?`companion-link-pill--linked`:`companion-link-pill--pending`}">
                ${a(t?C(`companions.membersOwnerBadge`):s(e.role))}
            </span>
        </div>
    `,{root:u,close:f}=d({variant:`glass-light`,cardStyle:`width: min(460px, calc(100vw - 24px)); max-width: 100%; max-height: 85vh; display: flex; flex-direction: column;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${a(C(`companions.membersTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                ${C(`companions.membersIntro`,{trip:a(t.name),role:a(s(t.myRole||`relaxer`))})}
            </p>

            <div style="display: flex; flex-direction: column; gap: var(--space-2); overflow-y: auto; padding: var(--space-1); margin-bottom: var(--space-5); flex: 1; min-height: 0;">
                ${i?l(i,!0):``}
                ${o.map(e=>l(e,!1)).join(``)}
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="tripMembersCloseBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">${a(C(`companions.closeBtn`))}</button>
            </div>
        `});r(u,`#tripMembersCloseBtn`).onclick=()=>f()},R=()=>{if(!c.activeTripId){_(C(`modals.addDayErrorNoTrip`));return}let e=(c.tripDays||[]).filter(e=>e.tripId===c.activeTripId).sort((e,t)=>e.dayNumber-t.dayNumber),t=e.filter(e=>e.dayNumber>0),n=(t.length>0?t[t.length-1].dayNumber:0)+1,i=``;if(e.length>0){let t=e[e.length-1];if(t.date){let e=new Date(t.date+`T00:00:00Z`);e.setUTCDate(e.getUTCDate()+1),i=e.toISOString().split(`T`)[0]??``}}let{root:o,close:s}=d({variant:`glass-light`,cardStyle:`width: 400px;`,innerHTML:`
            <div style="display: flex; align-items: center; justify-content: center; gap: var(--space-3); margin-bottom: var(--space-5);">
                <div style="background: var(--accent-blue); color: white; width: 28px; height: 28px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: var(--font-base);">${n}</div>
                <h2 class="card-title" style="font-size: var(--font-3xl); margin: 0; color: #000000; letter-spacing: -0.06em; font-weight: 800; text-align: center;">${a(C(`modals.addDayTitle`))}</h2>
            </div>
            <form id="addDayForm" style="display: flex; flex-direction: column; width: 100%;">
                <div class="mb-4">
                    <label class="form-label text-black/50" for="dayName">${a(C(`modals.addDayLabelWhere`))}</label>
                    <input type="text" id="dayName" class="glass-input-modal mdl-btn-dark" value="${a(C(`tripMedia.dayBucketDay`,{n}))}" placeholder="${a(C(`modals.addDayPlaceholderWhere`))}" required autofocus>
                </div>
                <div style="margin-bottom: var(--space-6);">
                    <label class="form-label text-black/50" for="dayDate">${a(C(`modals.addDayLabelDate`))} ${i?a(C(`modals.addDayDateAuto`)):``}</label>
                    <input type="date" id="dayDate" class="glass-input-modal mdl-btn-dark" value="${i}" required>
                </div>
                <div style="display: flex; gap: var(--space-2); width: 100%;">
                    <button type="submit" class="btn-primary flex-[2]">${a(C(`modals.addDayConfirmBtn`))}</button>
                    <button type="button" id="cancelDayBtn" class="btn-ghost" style="flex: 1; background: rgba(0,0,0,0.05); color: #000; border: none;">${a(C(`modals.addDayCancelBtn`))}</button>
                </div>
            </form>
        `}),u=c.activeTripId;r(o,`#cancelDayBtn`).onclick=()=>s(),r(o,`#addDayForm`).onsubmit=async e=>{e.preventDefault();let t={id:v(),tripId:u,name:r(o,`#dayName`).value,date:r(o,`#dayDate`).value,dayNumber:n,photos:[],notes:``,plan:{morning:``,afternoon:``,evening:``}};c.tripDays.push(t),b(`state:changed`);let i=await l(t);if(i&&!i.ok){let e=i.status||`no-response`,n=i.body?.error||``;_(C(`modals.addDayErrorServerSave`,{status:n?`${e} · ${n}`:String(e)})),console.error(`[upsertDay] failed`,{dayId:t.id,status:e,body:i.body})}s(),f(`home`)}},z=e({importTripFromFile:()=>M,openAddDayModal:()=>R,openCompanionPickerModal:()=>I,openDownloadChooserModal:()=>j,openEditTripModal:()=>k,openNewTripModal:()=>O,openPdfExportModal:()=>A,openShareChooserModal:()=>F,openShareTripModal:()=>N,openTripInviteResponseModal:()=>P});export{L as i,R as n,I as r,z as t};
//# sourceMappingURL=modals-BF45EWte.js.map