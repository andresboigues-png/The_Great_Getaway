import{$t as e,An as t,En as n,Fn as r,G as i,M as a,Mn as o,P as s,Q as c,Qt as l,S as u,Tn as d,c as f,et as p,i as m,in as h,kn as g,ln as _,n as v,r as y,sn as b,tn as x,un as S,vn as C,xt as w,yn as T}from"../app.bundle.js";import"./share-B_P0jxIZ.js";import"./trip-CqCZCV0O.js";import"./tripExport-DlRdZVxh.js";import{r as E}from"./balances-DQ_zUYqy.js";var D=a=>{let b=d.trips.find(e=>e.id===a);if(!b)return;if(!f(b)){O(a);return}Array.isArray(b.companions)||(b.companions=[]);let w=d.user?.id,D=new Set(d.expenses.filter(e=>e.tripId===a).flatMap(e=>[e.who,...Object.keys(e.splits||{})]).filter(Boolean).map(e=>String(e).toLocaleLowerCase())),k=e=>{let t=e.toLocaleLowerCase();return D.has(t)?!0:(d.budgets||[]).some(e=>e.tripId===a&&(e.user||``).toLocaleLowerCase()===t)},A=new Map((b.members||[]).map(e=>[e.userId,e])),j=[],M=e=>e===`planner`?u(`companions.rolePlanner`):e===`budgeteer`?u(`companions.roleBudgeteer`):e===`relaxer`?u(`companions.roleRelaxer`):e,N=e=>{let t=k(e.name),n=e.linkedUserId,r=!!n&&n===w,i=n?A.get(n):null,a=``;a=r?`<span class="companion-link-pill companion-link-pill--linked" title="${h(u(`companions.pillYouText`))}">${h(u(`companions.pillYouText`))}</span>`:i?`<span class="companion-link-pill companion-link-pill--linked" title="${h(u(`companions.pillLinkedTitle`))}">${h(M(i.role))}</span>`:n?`<span class="companion-link-pill companion-link-pill--pending" title="${h(u(`companions.pillPendingTitle`))}">${h(u(`companions.pillPendingText`))}</span>`:`<span class="companion-link-pill companion-link-pill--companion">${h(u(`companions.pillUnlinkedText`))}</span>`;let o=``;n?r&&(o=`<button type="button" class="btn-link-action picker-unlink-btn" data-name="${h(e.name)}">${h(u(`companions.rowUnlinkBtn`))}</button>`):o=`<button type="button" class="btn-link-action picker-link-btn" data-name="${h(e.name)}">${h(u(`companions.rowLinkBtn`))}</button>`;let s=r?``:t?`<span class="companion-row__lock" title="${h(u(`companions.rowLockTitle`))}" style="display:inline-flex; align-items:center;">${x(`lock`,{size:14})}</span>`:`<button type="button" class="btn-x-bare picker-remove-btn" data-name="${h(e.name)}" title="${h(u(`companions.rowRemoveTitle`))}">✕</button>`;return`
            <div class="companion-row" data-name="${h(e.name)}">
                <span class="companion-row__name">${h(e.name)}</span>
                ${a}
                <span style="flex:1;"></span>
                ${o}
                ${s}
            </div>
        `},P=()=>{let e=b.companions||[];return e.length===0?`<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-6); margin: 0;">
                ${h(u(`companions.pickerEmpty`))}
            </p>`:e.map(N).join(``)},{root:F,close:I}=e({variant:`glass-light`,cardStyle:`width: min(520px, calc(100vw - 24px)); max-width: 100%; max-height: 85vh; display: flex; flex-direction: column;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${h(u(`companions.pickerTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                ${u(`companions.pickerIntro`,{trip:h(b.name)})}
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
                <div class="companion-picker-add-title">${h(u(`companions.addSectionTitle`))}</div>

                <div class="companion-picker-add-path">
                    <div class="companion-picker-add-path__text">
                        <div class="companion-picker-add-path__name">${h(u(`companions.addPathFriendTitle`))}</div>
                        <div class="companion-picker-add-path__hint">${h(u(`companions.addPathFriendHint`))}</div>
                    </div>
                    <button type="button" id="companionPickerAddFriendBtn" class="companion-picker-add-section__friend-btn">
                        <span style="display:inline-flex; align-items:center;">${x(`user`,{size:16})}</span>
                        <span>${h(u(`companions.addFriendBtn`))}</span>
                    </button>
                </div>

                <div class="companion-picker-add-path">
                    <div class="companion-picker-add-path__text">
                        <div class="companion-picker-add-path__name">${h(u(`companions.addPathNameTitle`))}</div>
                        <div class="companion-picker-add-path__hint">${h(u(`companions.addPathNameHint`))}</div>
                    </div>
                    <form id="companionPickerAddForm" class="companion-picker-add-form" style="margin-bottom: 0;">
                        <input type="text" id="companionPickerAddInput" class="companion-picker-add-form__input" placeholder="${h(u(`companions.addInputPlaceholder`))}" autocomplete="off">
                        <button type="submit" class="companion-picker-add-form__btn">${h(u(`companions.addBtn`))}</button>
                    </form>
                </div>
            </div>

            <!-- Friend picker (hidden by default) — appears when "Add a
                 friend" is clicked, listing accepted friends not already
                 on this trip. Pick one + role → adds to trip + invites. -->
            <div id="companionPickerFriendSheet" class="companion-picker-friend-sheet" hidden>
                <div class="companion-picker-friend-sheet__header">
                    <strong id="companionPickerFriendSheetTitle">${h(u(`companions.friendSheetTitle`))}</strong>
                    <button type="button" id="companionPickerFriendCancel" class="btn-x-bare" title="${h(u(`companions.rowCloseTitle`))}">✕</button>
                </div>
                <div id="companionPickerFriendList" class="companion-picker-friend-sheet__list">
                    <p style="text-align:center; color: rgba(0,0,0,0.45); padding: var(--space-4); margin: 0;">${h(u(`companions.friendSheetLoading`))}</p>
                </div>
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="companionPickerCloseBtn" class="btn-primary" style="flex: 1; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">${h(u(`companions.doneBtn`))}</button>
            </div>
        `}),L=_(F,`#companionPickerList`),R=_(F,`#companionPickerFriendSheet`),z=_(F,`#companionPickerFriendList`),B=_(F,`#companionPickerFriendSheetTitle`),V=_(F,`#companionPickerAddInput`),H=()=>{L.innerHTML=P()},U=()=>{let e=R.dataset.linkTargetName,t=new Set((b.companions||[]).map(e=>e.linkedUserId).filter(Boolean)),n=j.filter(e=>e.id!==w&&!t.has(e.id)),r=e&&w?`
            <div class="companion-row friend-pick-row picker-self-row">
                ${d.user?.picture?`<img src="${h(d.user.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">`:``}
                <span class="companion-row__name">${h(d.user?.name||u(`companions.pillYouText`))}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${h(u(`companions.pillYouText`))}</span>
                <button type="button" class="btn-link-action picker-link-self-btn">${h(u(`companions.linkMeBtn`))}</button>
            </div>`:``;if(n.length===0&&!r){z.innerHTML=`<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-4); margin: 0;">
                ${h(u(`companions.friendSheetEmpty`))}
            </p>`;return}z.innerHTML=r+n.map(e=>`
            <div class="companion-row friend-pick-row picker-friend-row" data-friend-id="${h(e.id)}" data-friend-name="${h(e.name)}">
                <img src="${h(e.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">
                <span class="companion-row__name">${h(e.name)}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${h(e.email)}</span>
                <select class="companion-row__role-select picker-friend-role-select">
                    <option value="${m}" selected>${h(u(`companions.roleRelaxer`))}</option>
                    <option value="${v}">${h(u(`companions.roleBudgeteer`))}</option>
                    <option value="${y}">${h(u(`companions.rolePlanner`))}</option>
                </select>
                <button type="button" class="btn-link-action picker-friend-add-btn">${h(u(`companions.friendAddBtn`))}</button>
            </div>
        `).join(``)};_(F,`#companionPickerCloseBtn`).onclick=()=>{I(),n(`state:changed`)},_(F,`#companionPickerFriendCancel`).onclick=()=>{R.hidden=!0},_(F,`#companionPickerAddFriendBtn`).onclick=async()=>{delete R.dataset.linkTargetName,B&&(B.textContent=u(`companions.friendSheetTitle`)),R.hidden=!1,j=await i(),U()},_(F,`#companionPickerAddForm`).onsubmit=e=>{e.preventDefault();let t=V.value.trim();if(t){if(o(b,t)){S(u(`companions.addDuplicate`,{name:t}),`info`),V.value=``,V.focus();return}g(b,t),n(`state:changed`),s(b),V.value=``,H()}},F.addEventListener(`click`,e=>{(async()=>{let a=e.target;if(!a)return;let d=a.closest(`.picker-remove-btn`);if(d?.dataset.name){let e=d.dataset.name,t=o(b,e);if(!t||t.linkedUserId&&t.linkedUserId===w)return;let i=()=>{r(b,e),n(`state:changed`),s(b),t.linkedUserId&&p(b.id,t.linkedUserId),H()},{balances:a}=E(b),c=a[e]??0;if(Math.abs(c)>.01){let t=T();l({title:u(`companions.removeWithBalanceTitle`),message:c>0?u(`companions.removeWithBalanceOwed`,{name:e,amount:C(c,t)}):u(`companions.removeWithBalanceOwes`,{name:e,amount:C(Math.abs(c),t)}),confirmText:u(`common.remove`),onConfirm:i})}else t.linkedUserId?l({title:u(`companions.removeConfirmTitle`),message:u(`companions.removeConfirmBody`,{name:e}),confirmText:u(`common.remove`),onConfirm:i}):i();return}let f=a.closest(`.picker-unlink-btn`);if(f?.dataset.name){let e=o(b,f.dataset.name);e&&delete e.linkedUserId,n(`state:changed`),s(b),H();return}let m=a.closest(`.picker-link-btn`);if(m?.dataset.name){R.hidden=!1,R.dataset.linkTargetName=m.dataset.name,B&&(B.textContent=u(`companions.linkSheetTitle`)),j=await i(),U();return}if(a.closest(`.picker-link-self-btn`)){let e=R.dataset.linkTargetName;if(e&&w){let r=o(b,e);r&&(r.linkedUserId=w,t(b,w,r.name,k)),delete R.dataset.linkTargetName,n(`state:changed`),s(b),R.hidden=!0,H()}return}let h=a.closest(`.picker-friend-add-btn`);if(h){let e=h.closest(`.picker-friend-row`);if(!e?.dataset.friendId)return;let r=e.dataset.friendId,i=e.dataset.friendName||`Friend`,a=e.querySelector(`.picker-friend-role-select`)?.value||`relaxer`,l=await c(b.id,r,a);if(!l.ok){S(l.status===409?u(`companions.inviteRoleConflict`,{name:i}):l.status===404?u(`companions.inviteUnavailable`,{name:i}):u(`companions.inviteFailed`,{name:i}));return}let d=R.dataset.linkTargetName,f=i;if(d){let e=o(b,d);e?(e.linkedUserId=r,f=e.name):f=g(b,i,r).name,delete R.dataset.linkTargetName}else{let e=o(b,i);e&&!e.linkedUserId?(e.linkedUserId=r,f=e.name):f=g(b,i,r).name}t(b,r,f,k),n(`state:changed`),s(b),R.hidden=!0,H(),S(u(`companions.invitedToast`,{name:i,role:M(a)}),`success`)}})()})},O=t=>{let n=d.trips.find(e=>e.id===t);if(!n)return;let r=n.members||[],i=r.find(e=>e.userId===n.ownerId),a=r.filter(e=>e.userId!==n.ownerId),o=e=>e===`planner`?u(`companions.rolePlanner`):e===`budgeteer`?u(`companions.roleBudgeteer`):e===`relaxer`?u(`companions.roleRelaxer`):e,s=(e,t)=>`
        <div class="companion-row" style="cursor: default;">
            ${e.picture?`<img src="${h(e.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">`:``}
            <span class="companion-row__name">${h(e.name||e.userId)}</span>
            <span class="companion-link-pill ${t?`companion-link-pill--linked`:`companion-link-pill--pending`}">
                ${h(t?u(`companions.membersOwnerBadge`):o(e.role))}
            </span>
        </div>
    `,{root:c,close:l}=e({variant:`glass-light`,cardStyle:`width: min(460px, calc(100vw - 24px)); max-width: 100%; max-height: 85vh; display: flex; flex-direction: column;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${h(u(`companions.membersTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                ${u(`companions.membersIntro`,{trip:h(n.name),role:h(o(n.myRole||`relaxer`))})}
            </p>

            <div style="display: flex; flex-direction: column; gap: var(--space-2); overflow-y: auto; padding: var(--space-1); margin-bottom: var(--space-5); flex: 1; min-height: 0;">
                ${i?s(i,!0):``}
                ${a.map(e=>s(e,!1)).join(``)}
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="tripMembersCloseBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">${h(u(`companions.closeBtn`))}</button>
            </div>
        `});_(c,`#tripMembersCloseBtn`).onclick=()=>l()},k=()=>{if(!d.activeTripId){S(u(`modals.addDayErrorNoTrip`));return}let t=(d.tripDays||[]).filter(e=>e.tripId===d.activeTripId).sort((e,t)=>e.dayNumber-t.dayNumber),r=t.filter(e=>e.dayNumber>0),i=(r.length>0?r[r.length-1].dayNumber:0)+1,o=``;if(t.length>0){let e=t[t.length-1];if(e.date){let t=new Date(e.date+`T00:00:00Z`);t.setUTCDate(t.getUTCDate()+1),o=t.toISOString().split(`T`)[0]??``}}let{root:s,close:c}=e({variant:`glass-light`,cardStyle:`width: 400px;`,innerHTML:`
            <div style="display: flex; align-items: center; justify-content: center; gap: var(--space-3); margin-bottom: var(--space-5);">
                <div style="background: var(--accent-blue); color: white; width: 28px; height: 28px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: var(--font-base);">${i}</div>
                <h2 class="card-title" style="font-size: var(--font-3xl); margin: 0; color: #000000; letter-spacing: -0.06em; font-weight: 800; text-align: center;">${h(u(`modals.addDayTitle`))}</h2>
            </div>
            <form id="addDayForm" style="display: flex; flex-direction: column; width: 100%;">
                <div class="mb-4">
                    <label class="form-label text-black/50" for="dayName">${h(u(`modals.addDayLabelWhere`))}</label>
                    <input type="text" id="dayName" class="glass-input-modal mdl-btn-dark" value="${h(u(`tripMedia.dayBucketDay`,{n:i}))}" placeholder="${h(u(`modals.addDayPlaceholderWhere`))}" required autofocus>
                </div>
                <div style="margin-bottom: var(--space-6);">
                    <label class="form-label text-black/50" for="dayDate">${h(u(`modals.addDayLabelDate`))} ${o?h(u(`modals.addDayDateAuto`)):``}</label>
                    <input type="date" id="dayDate" class="glass-input-modal mdl-btn-dark" value="${o}" required>
                </div>
                <div style="display: flex; gap: var(--space-2); width: 100%;">
                    <button type="submit" class="btn-primary flex-[2]">${h(u(`modals.addDayConfirmBtn`))}</button>
                    <button type="button" id="cancelDayBtn" class="btn-ghost" style="flex: 1; background: rgba(0,0,0,0.05); color: #000; border: none;">${h(u(`modals.addDayCancelBtn`))}</button>
                </div>
            </form>
        `}),l=d.activeTripId;_(s,`#cancelDayBtn`).onclick=()=>c(),_(s,`#addDayForm`).onsubmit=async e=>{e.preventDefault();let t={id:b(),tripId:l,name:_(s,`#dayName`).value,date:_(s,`#dayDate`).value,dayNumber:i,photos:[],notes:``,plan:{morning:``,afternoon:``,evening:``}};d.tripDays.push(t),n(`state:changed`);let r=await a(t);if(r&&!r.ok){let e=r.status||`no-response`,n=r.body?.error||``;S(u(`modals.addDayErrorServerSave`,{status:n?`${e} · ${n}`:String(e)})),console.error(`[upsertDay] failed`,{dayId:t.id,status:e,body:r.body})}c(),w(`home`)}};export{D as n,O as r,k as t};
//# sourceMappingURL=modals-C6ZA5he1.js.map