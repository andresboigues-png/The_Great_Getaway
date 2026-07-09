import{Cn as e,G as t,Gn as n,Hn as r,Jn as i,Mn as a,N as o,Pt as s,Rn as c,Sn as l,U as u,Un as d,_n as f,bn as p,c as m,dn as h,fn as g,ft as _,i as v,jn as y,mn as b,n as x,r as S,rt as C,ut as w,zn as T}from"../app.bundle.js";import"./share-07YSK2e2.js";import"./trip-CWzNUrtZ.js";import"./tripExport-MLYgdugJ.js";import{i as E}from"./balances-DWt5ulFX.js";var D=s=>{let u=c.trips.find(e=>e.id===s);if(!u)return;if(!m(u)){O(s);return}Array.isArray(u.companions)||(u.companions=[]);let p=c.user?.id,D=new Set(c.expenses.filter(e=>e.tripId===s).flatMap(e=>[e.who,...Object.keys(e.splits||{})]).filter(Boolean).map(e=>String(e).toLocaleLowerCase())),k=e=>{let t=e.toLocaleLowerCase();return D.has(t)?!0:(c.budgets||[]).some(e=>e.tripId===s&&(e.user||``).toLocaleLowerCase()===t)},A=new Map((u.members||[]).map(e=>[e.userId,e])),j=[],M=e=>e===`planner`?o(`companions.rolePlanner`):e===`budgeteer`?o(`companions.roleBudgeteer`):e===`relaxer`?o(`companions.roleRelaxer`):e,N=e=>{let t=k(e.name),n=e.linkedUserId,r=!!n&&n===p,i=n?A.get(n):null,a=``;a=r?`<span class="companion-link-pill companion-link-pill--linked" title="${f(o(`companions.pillYouText`))}">${f(o(`companions.pillYouText`))}</span>`:i?`<span class="companion-link-pill companion-link-pill--linked" title="${f(o(`companions.pillLinkedTitle`))}">${f(M(i.role))}</span>`:n?`<span class="companion-link-pill companion-link-pill--pending" title="${f(o(`companions.pillPendingTitle`))}">${f(o(`companions.pillPendingText`))}</span>`:`<span class="companion-link-pill companion-link-pill--companion">${f(o(`companions.pillUnlinkedText`))}</span>`;let s=``;n?r?s=`<button type="button" class="btn-link-action picker-unlink-btn" data-name="${f(e.name)}">${f(o(`companions.rowUnlinkBtn`))}</button>`:i||(s=`<button type="button" class="btn-link-action picker-cancel-invite-btn" data-name="${f(e.name)}">${f(o(`companions.rowCancelInviteBtn`))}</button>`):s=`<button type="button" class="btn-link-action picker-link-btn" data-name="${f(e.name)}">${f(o(`companions.rowLinkBtn`))}</button>`;let c=r?``:t?`<span class="companion-row__lock" title="${f(o(`companions.rowLockTitle`))}" style="display:inline-flex; align-items:center;">${b(`lock`,{size:14})}</span>`:`<button type="button" class="btn-x-bare picker-remove-btn" data-name="${f(e.name)}" title="${f(o(`companions.rowRemoveTitle`))}">✕</button>`;return`
            <div class="companion-row" data-name="${f(e.name)}">
                <span class="companion-row__name">${f(e.name)}</span>
                ${a}
                <span style="flex:1;"></span>
                ${s}
                ${c}
            </div>
        `},P=()=>{let e=u.companions||[];return e.length===0?`<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-6); margin: 0;">
                ${f(o(`companions.pickerEmpty`))}
            </p>`:e.map(N).join(``)},{root:F,close:I}=g({variant:`glass-light`,cardStyle:`width: min(520px, calc(100vw - 24px)); max-width: 100%; max-height: 85vh; display: flex; flex-direction: column;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${f(o(`companions.pickerTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                ${o(`companions.pickerIntro`,{trip:f(u.name)})}
            </p>

            <div id="companionPickerList" style="display: flex; flex-direction: column; gap: var(--space-2); overflow-y: auto; padding: var(--space-1); margin-bottom: var(--space-4); flex: 1; min-height: 0;">
                ${P()}
            </div>

            <!-- Add someone — two clearly-labeled paths so it reads as a
                 choice, not two mystery controls: (1) a friend with an
                 account (gets a trip invite), (2) just a name for a
                 non-app traveller. Same element ids as before so every
                 handler is unchanged. Both write to trip.companions
                 immediately, so what the user sees IS the saved state. -->
            <div class="companion-picker-add-section">
                <div class="companion-picker-add-title">${f(o(`companions.addSectionTitle`))}</div>

                <div class="companion-picker-add-path">
                    <div class="companion-picker-add-path__text">
                        <div class="companion-picker-add-path__name">${f(o(`companions.addPathFriendTitle`))}</div>
                        <div class="companion-picker-add-path__hint">${f(o(`companions.addPathFriendHint`))}</div>
                    </div>
                    <button type="button" id="companionPickerAddFriendBtn" class="companion-picker-add-section__friend-btn">
                        <span style="display:inline-flex; align-items:center;">${b(`user`,{size:16})}</span>
                        <span>${f(o(`companions.addFriendBtn`))}</span>
                    </button>
                </div>

                <div class="companion-picker-add-path">
                    <div class="companion-picker-add-path__text">
                        <div class="companion-picker-add-path__name">${f(o(`companions.addPathNameTitle`))}</div>
                        <div class="companion-picker-add-path__hint">${f(o(`companions.addPathNameHint`))}</div>
                    </div>
                    <form id="companionPickerAddForm" class="companion-picker-add-form" style="margin-bottom: 0;">
                        <input type="text" id="companionPickerAddInput" class="companion-picker-add-form__input" placeholder="${f(o(`companions.addInputPlaceholder`))}" autocomplete="off" maxlength="200">
                        <button type="submit" class="companion-picker-add-form__btn">${f(o(`companions.addBtn`))}</button>
                    </form>
                </div>
            </div>

            <!-- Friend picker (hidden by default) — appears when "Add a
                 friend" is clicked, listing accepted friends not already
                 on this trip. Pick one + role → adds to trip + invites. -->
            <div id="companionPickerFriendSheet" class="companion-picker-friend-sheet" hidden>
                <div class="companion-picker-friend-sheet__header">
                    <strong id="companionPickerFriendSheetTitle">${f(o(`companions.friendSheetTitle`))}</strong>
                    <button type="button" id="companionPickerFriendCancel" class="btn-x-bare" title="${f(o(`companions.rowCloseTitle`))}">✕</button>
                </div>
                <div id="companionPickerFriendList" class="companion-picker-friend-sheet__list">
                    <p style="text-align:center; color: rgba(0,0,0,0.45); padding: var(--space-4); margin: 0;">${f(o(`companions.friendSheetLoading`))}</p>
                </div>
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="companionPickerCloseBtn" class="btn-primary" style="flex: 1; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">${f(o(`companions.doneBtn`))}</button>
            </div>
        `}),L=l(F,`#companionPickerList`),R=l(F,`#companionPickerFriendSheet`),z=l(F,`#companionPickerFriendList`),B=l(F,`#companionPickerFriendSheetTitle`),V=l(F,`#companionPickerAddInput`),H=()=>{L.innerHTML=P()},U=()=>{let e=R.dataset.linkTargetName,t=new Set((u.companions||[]).map(e=>e.linkedUserId).filter(Boolean)),n=j.filter(e=>e.id!==p&&!t.has(e.id)),r=e&&p?`
            <div class="companion-row friend-pick-row picker-self-row">
                ${c.user?.picture?`<img src="${f(c.user.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">`:``}
                <span class="companion-row__name">${f(c.user?.name||o(`companions.pillYouText`))}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${f(o(`companions.pillYouText`))}</span>
                <button type="button" class="btn-link-action picker-link-self-btn">${f(o(`companions.linkMeBtn`))}</button>
            </div>`:``;if(n.length===0&&!r){z.innerHTML=`<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-4); margin: 0;">
                ${f(o(`companions.friendSheetEmpty`))}
            </p>`;return}z.innerHTML=r+n.map(e=>`
            <div class="companion-row friend-pick-row picker-friend-row" data-friend-id="${f(e.id)}" data-friend-name="${f(e.name)}">
                <img src="${f(e.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">
                <span class="companion-row__name">${f(e.name)}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${f(e.email)}</span>
                <select class="companion-row__role-select picker-friend-role-select">
                    <option value="${v}" selected>${f(o(`companions.roleRelaxer`))}</option>
                    <option value="${x}">${f(o(`companions.roleBudgeteer`))}</option>
                    <option value="${S}">${f(o(`companions.rolePlanner`))}</option>
                </select>
                <button type="button" class="btn-link-action picker-friend-add-btn">${f(o(`companions.friendAddBtn`))}</button>
            </div>
        `).join(``)};l(F,`#companionPickerCloseBtn`).onclick=()=>{I(),T(`state:changed`)},l(F,`#companionPickerFriendCancel`).onclick=()=>{R.hidden=!0},l(F,`#companionPickerAddFriendBtn`).onclick=async()=>{delete R.dataset.linkTargetName,B&&(B.textContent=o(`companions.friendSheetTitle`)),R.hidden=!1,j=await C(),U()},l(F,`#companionPickerAddForm`).onsubmit=i=>{i.preventDefault();let a=V.value.trim();if(a){if(n(u,a)){e(o(`companions.addDuplicate`,{name:a}),`info`),V.value=``,V.focus();return}r(u,a),T(`state:changed`),t(u),V.value=``,H()}},F.addEventListener(`click`,s=>{(async()=>{let c=s.target;if(!c)return;let l=c.closest(`.picker-remove-btn`);if(l?.dataset.name){let e=l.dataset.name,r=n(u,e);if(!r||r.linkedUserId&&r.linkedUserId===p)return;let s=()=>{i(u,e),T(`state:changed`),t(u),r.linkedUserId&&_(u.id,r.linkedUserId),H()},{balances:c}=E(u),d=c[e]??0;if(Math.abs(d)>.01){let t=a();h({title:o(`companions.removeWithBalanceTitle`),message:d>0?o(`companions.removeWithBalanceOwed`,{name:e,amount:y(d,t)}):o(`companions.removeWithBalanceOwes`,{name:e,amount:y(Math.abs(d),t)}),confirmText:o(`common.remove`),onConfirm:s})}else r.linkedUserId?h({title:o(`companions.removeConfirmTitle`),message:o(`companions.removeConfirmBody`,{name:e}),confirmText:o(`common.remove`),onConfirm:s}):s();return}let f=c.closest(`.picker-unlink-btn`);if(f?.dataset.name){let e=n(u,f.dataset.name);e&&delete e.linkedUserId,T(`state:changed`),t(u),H();return}let m=c.closest(`.picker-cancel-invite-btn`);if(m?.dataset.name){let e=m.dataset.name,r=n(u,e);if(!r||!r.linkedUserId||r.linkedUserId===p)return;let i=r.linkedUserId;h({title:o(`companions.cancelInviteTitle`),message:o(`companions.cancelInviteBody`,{name:e}),confirmText:o(`companions.cancelInviteConfirm`),onConfirm:()=>{delete r.linkedUserId,T(`state:changed`),t(u),_(u.id,i),H()}});return}let g=c.closest(`.picker-link-btn`);if(g?.dataset.name){R.hidden=!1,R.dataset.linkTargetName=g.dataset.name,B&&(B.textContent=o(`companions.linkSheetTitle`)),j=await C(),U();return}if(c.closest(`.picker-link-self-btn`)){let e=R.dataset.linkTargetName;if(e&&p){let r=n(u,e);r&&(r.linkedUserId=p,d(u,p,r.name,k)),delete R.dataset.linkTargetName,T(`state:changed`),t(u),R.hidden=!0,H()}return}let v=c.closest(`.picker-friend-add-btn`);if(v){let i=v.closest(`.picker-friend-row`);if(!i?.dataset.friendId)return;let a=i.dataset.friendId,s=i.dataset.friendName||`Friend`,c=i.querySelector(`.picker-friend-role-select`)?.value||`relaxer`,l=await w(u.id,a,c);if(!l.ok){e(l.status===409?o(`companions.inviteRoleConflict`,{name:s}):l.status===404?o(`companions.inviteUnavailable`,{name:s}):o(`companions.inviteFailed`,{name:s}));return}let f=R.dataset.linkTargetName,p=s;if(f){let e=n(u,f);e?(e.linkedUserId=a,p=e.name):p=r(u,s,a).name,delete R.dataset.linkTargetName}else{let e=n(u,s);e&&!e.linkedUserId?(e.linkedUserId=a,p=e.name):p=r(u,s,a).name}d(u,a,p,k),T(`state:changed`),t(u),R.hidden=!0,H(),e(o(`companions.invitedToast`,{name:s,role:M(c)}),`success`)}})()})},O=e=>{let t=c.trips.find(t=>t.id===e);if(!t)return;let n=t.members||[],r=n.find(e=>e.userId===t.ownerId),i=n.filter(e=>e.userId!==t.ownerId),a=e=>e===`planner`?o(`companions.rolePlanner`):e===`budgeteer`?o(`companions.roleBudgeteer`):e===`relaxer`?o(`companions.roleRelaxer`):e,s=(e,t)=>`
        <div class="companion-row" style="cursor: default;">
            ${e.picture?`<img src="${f(e.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">`:``}
            <span class="companion-row__name">${f(e.name||e.userId)}</span>
            <span class="companion-link-pill ${t?`companion-link-pill--linked`:`companion-link-pill--pending`}">
                ${f(t?o(`companions.membersOwnerBadge`):a(e.role))}
            </span>
        </div>
    `,{root:u,close:d}=g({variant:`glass-light`,cardStyle:`width: min(460px, calc(100vw - 24px)); max-width: 100%; max-height: 85vh; display: flex; flex-direction: column;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${f(o(`companions.membersTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                ${o(`companions.membersIntro`,{trip:f(t.name),role:f(a(t.myRole||`relaxer`))})}
            </p>

            <div style="display: flex; flex-direction: column; gap: var(--space-2); overflow-y: auto; padding: var(--space-1); margin-bottom: var(--space-5); flex: 1; min-height: 0;">
                ${r?s(r,!0):``}
                ${i.map(e=>s(e,!1)).join(``)}
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="tripMembersCloseBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">${f(o(`companions.closeBtn`))}</button>
            </div>
        `});l(u,`#tripMembersCloseBtn`).onclick=()=>d()},k=()=>{if(!c.activeTripId){e(o(`modals.addDayErrorNoTrip`));return}let t=(c.tripDays||[]).filter(e=>e.tripId===c.activeTripId).sort((e,t)=>e.dayNumber-t.dayNumber),n=t.filter(e=>e.dayNumber>0),r=(n.length>0?n[n.length-1].dayNumber:0)+1,i=``;if(t.length>0){let e=t[t.length-1];if(e.date){let t=new Date(e.date+`T00:00:00Z`);t.setUTCDate(t.getUTCDate()+1),i=t.toISOString().split(`T`)[0]??``}}let{root:a,close:d}=g({variant:`glass-light`,cardStyle:`width: 400px;`,innerHTML:`
            <div style="display: flex; align-items: center; justify-content: center; gap: var(--space-3); margin-bottom: var(--space-5);">
                <div style="background: var(--accent-blue); color: white; width: 28px; height: 28px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: var(--font-base);">${r}</div>
                <h2 class="card-title" style="font-size: var(--font-3xl); margin: 0; color: #000000; letter-spacing: -0.06em; font-weight: 800; text-align: center;">${f(o(`modals.addDayTitle`))}</h2>
            </div>
            <form id="addDayForm" style="display: flex; flex-direction: column; width: 100%;">
                <div class="mb-4">
                    <label class="form-label text-black/50" for="dayName">${f(o(`modals.addDayLabelWhere`))}</label>
                    <input type="text" id="dayName" class="glass-input-modal mdl-btn-dark" value="${f(o(`tripMedia.dayBucketDay`,{n:r}))}" placeholder="${f(o(`modals.addDayPlaceholderWhere`))}" required autofocus>
                </div>
                <div style="margin-bottom: var(--space-6);">
                    <label class="form-label text-black/50" for="dayDate">${f(o(`modals.addDayLabelDate`))} ${i?f(o(`modals.addDayDateAuto`)):``}</label>
                    <input type="date" id="dayDate" class="glass-input-modal mdl-btn-dark" value="${i}" required>
                </div>
                <div style="display: flex; gap: var(--space-2); width: 100%;">
                    <button type="submit" class="btn-primary flex-[2]">${f(o(`modals.addDayConfirmBtn`))}</button>
                    <button type="button" id="cancelDayBtn" class="btn-ghost" style="flex: 1; background: rgba(0,0,0,0.05); color: #000; border: none;">${f(o(`modals.addDayCancelBtn`))}</button>
                </div>
            </form>
        `}),m=c.activeTripId;l(a,`#cancelDayBtn`).onclick=()=>d(),l(a,`#addDayForm`).onsubmit=async t=>{t.preventDefault();let n={id:p(),tripId:m,name:l(a,`#dayName`).value,date:l(a,`#dayDate`).value,dayNumber:r,photos:[],notes:``,plan:{morning:``,afternoon:``,evening:``}};c.tripDays.push(n),T(`state:changed`);let i=await u(n);if(i&&!i.ok){let t=i.status||`no-response`,r=i.body?.error||``;e(o(`modals.addDayErrorServerSave`,{status:r?`${t} · ${r}`:String(t)})),console.error(`[upsertDay] failed`,{dayId:n.id,status:t,body:i.body})}d(),s(`home`)}};export{D as n,O as r,k as t};
//# sourceMappingURL=modals-Di_7PZwq.js.map