import{$t as e,An as t,Dn as n,En as r,G as i,In as a,M as o,Nn as s,P as c,Q as l,S as u,an as d,bn as f,c as p,cn as m,dn as h,en as g,et as _,i as v,jn as y,n as b,nn as x,r as S,un as C,xt as w,yn as T}from"../app.bundle.js";import"./share-D2cFFD-k.js";import"./trip-BDZDe7K1.js";import"./tripExport-CkJiXhHh.js";import{r as E}from"./balances-mnVWuxH_.js";var D=o=>{let m=r.trips.find(e=>e.id===o);if(!m)return;if(!p(m)){O(o);return}Array.isArray(m.companions)||(m.companions=[]);let w=r.user?.id,D=new Set(r.expenses.filter(e=>e.tripId===o).flatMap(e=>[e.who,...Object.keys(e.splits||{})]).filter(Boolean).map(e=>String(e).toLocaleLowerCase())),k=e=>{let t=e.toLocaleLowerCase();return D.has(t)?!0:(r.budgets||[]).some(e=>e.tripId===o&&(e.user||``).toLocaleLowerCase()===t)},A=new Map((m.members||[]).map(e=>[e.userId,e])),j=[],M=e=>e===`planner`?u(`companions.rolePlanner`):e===`budgeteer`?u(`companions.roleBudgeteer`):e===`relaxer`?u(`companions.roleRelaxer`):e,N=e=>{let t=D.has(e.name.toLocaleLowerCase()),n=e.linkedUserId,r=!!n&&n===w,i=n?A.get(n):null,a=``;a=r?`<span class="companion-link-pill companion-link-pill--linked" title="${d(u(`companions.pillYouText`))}">${d(u(`companions.pillYouText`))}</span>`:i?`<span class="companion-link-pill companion-link-pill--linked" title="${d(u(`companions.pillLinkedTitle`))}">${d(M(i.role))}</span>`:n?`<span class="companion-link-pill companion-link-pill--pending" title="${d(u(`companions.pillPendingTitle`))}">${d(u(`companions.pillPendingText`))}</span>`:`<span class="companion-link-pill companion-link-pill--companion">${d(u(`companions.pillUnlinkedText`))}</span>`;let o=``;n?r&&(o=`<button type="button" class="btn-link-action picker-unlink-btn" data-name="${d(e.name)}">${d(u(`companions.rowUnlinkBtn`))}</button>`):o=`<button type="button" class="btn-link-action picker-link-btn" data-name="${d(e.name)}">${d(u(`companions.rowLinkBtn`))}</button>`;let s=t?`<span class="companion-row__lock" title="${d(u(`companions.rowLockTitle`))}" style="display:inline-flex; align-items:center;">${x(`lock`,{size:14})}</span>`:`<button type="button" class="btn-x-bare picker-remove-btn" data-name="${d(e.name)}" title="${d(u(`companions.rowRemoveTitle`))}">✕</button>`;return`
            <div class="companion-row" data-name="${d(e.name)}">
                <span class="companion-row__name">${d(e.name)}</span>
                ${a}
                <span style="flex:1;"></span>
                ${o}
                ${s}
            </div>
        `},P=()=>{let e=m.companions||[];return e.length===0?`<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-6); margin: 0;">
                ${d(u(`companions.pickerEmpty`))}
            </p>`:e.map(N).join(``)},{root:F,close:I}=g({variant:`glass-light`,cardStyle:`width: min(520px, calc(100vw - 24px)); max-width: 100%; max-height: 85vh; display: flex; flex-direction: column;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${d(u(`companions.pickerTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                ${u(`companions.pickerIntro`,{trip:d(m.name)})}
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
                <div class="companion-picker-add-title">${d(u(`companions.addSectionTitle`))}</div>

                <div class="companion-picker-add-path">
                    <div class="companion-picker-add-path__text">
                        <div class="companion-picker-add-path__name">${d(u(`companions.addPathFriendTitle`))}</div>
                        <div class="companion-picker-add-path__hint">${d(u(`companions.addPathFriendHint`))}</div>
                    </div>
                    <button type="button" id="companionPickerAddFriendBtn" class="companion-picker-add-section__friend-btn">
                        <span style="display:inline-flex; align-items:center;">${x(`user`,{size:16})}</span>
                        <span>${d(u(`companions.addFriendBtn`))}</span>
                    </button>
                </div>

                <div class="companion-picker-add-path">
                    <div class="companion-picker-add-path__text">
                        <div class="companion-picker-add-path__name">${d(u(`companions.addPathNameTitle`))}</div>
                        <div class="companion-picker-add-path__hint">${d(u(`companions.addPathNameHint`))}</div>
                    </div>
                    <form id="companionPickerAddForm" class="companion-picker-add-form" style="margin-bottom: 0;">
                        <input type="text" id="companionPickerAddInput" class="companion-picker-add-form__input" placeholder="${d(u(`companions.addInputPlaceholder`))}" autocomplete="off">
                        <button type="submit" class="companion-picker-add-form__btn">${d(u(`companions.addBtn`))}</button>
                    </form>
                </div>
            </div>

            <!-- Friend picker (hidden by default) — appears when "Add a
                 friend" is clicked, listing accepted friends not already
                 on this trip. Pick one + role → adds to trip + invites. -->
            <div id="companionPickerFriendSheet" class="companion-picker-friend-sheet" hidden>
                <div class="companion-picker-friend-sheet__header">
                    <strong id="companionPickerFriendSheetTitle">${d(u(`companions.friendSheetTitle`))}</strong>
                    <button type="button" id="companionPickerFriendCancel" class="btn-x-bare" title="${d(u(`companions.rowCloseTitle`))}">✕</button>
                </div>
                <div id="companionPickerFriendList" class="companion-picker-friend-sheet__list">
                    <p style="text-align:center; color: rgba(0,0,0,0.45); padding: var(--space-4); margin: 0;">${d(u(`companions.friendSheetLoading`))}</p>
                </div>
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="companionPickerCloseBtn" class="btn-primary" style="flex: 1; padding: var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-lg);">${d(u(`companions.doneBtn`))}</button>
            </div>
        `}),L=C(F,`#companionPickerList`),R=C(F,`#companionPickerFriendSheet`),z=C(F,`#companionPickerFriendList`),B=C(F,`#companionPickerFriendSheetTitle`),V=C(F,`#companionPickerAddInput`),H=()=>{L.innerHTML=P()},U=()=>{let e=R.dataset.linkTargetName,t=new Set((m.companions||[]).map(e=>e.linkedUserId).filter(Boolean)),n=j.filter(e=>e.id!==w&&!t.has(e.id)),i=e&&w?`
            <div class="companion-row friend-pick-row picker-self-row">
                ${r.user?.picture?`<img src="${d(r.user.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">`:``}
                <span class="companion-row__name">${d(r.user?.name||u(`companions.pillYouText`))}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${d(u(`companions.pillYouText`))}</span>
                <button type="button" class="btn-link-action picker-link-self-btn">${d(u(`companions.linkMeBtn`))}</button>
            </div>`:``;if(n.length===0&&!i){z.innerHTML=`<p style="text-align:center; color: rgba(0,0,0,0.55); padding: var(--space-4); margin: 0;">
                ${d(u(`companions.friendSheetEmpty`))}
            </p>`;return}z.innerHTML=i+n.map(e=>`
            <div class="companion-row friend-pick-row picker-friend-row" data-friend-id="${d(e.id)}" data-friend-name="${d(e.name)}">
                <img src="${d(e.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">
                <span class="companion-row__name">${d(e.name)}</span>
                <span style="flex:1; font-size: var(--font-xs); color: rgba(0,0,0,0.45);">${d(e.email)}</span>
                <select class="companion-row__role-select picker-friend-role-select">
                    <option value="${v}" selected>${d(u(`companions.roleRelaxer`))}</option>
                    <option value="${b}">${d(u(`companions.roleBudgeteer`))}</option>
                    <option value="${S}">${d(u(`companions.rolePlanner`))}</option>
                </select>
                <button type="button" class="btn-link-action picker-friend-add-btn">${d(u(`companions.friendAddBtn`))}</button>
            </div>
        `).join(``)};C(F,`#companionPickerCloseBtn`).onclick=()=>{I(),n(`state:changed`)},C(F,`#companionPickerFriendCancel`).onclick=()=>{R.hidden=!0},C(F,`#companionPickerAddFriendBtn`).onclick=async()=>{delete R.dataset.linkTargetName,B&&(B.textContent=u(`companions.friendSheetTitle`)),R.hidden=!1,j.length===0&&(j=await i()),U()},C(F,`#companionPickerAddForm`).onsubmit=e=>{e.preventDefault();let r=V.value.trim();if(r){if(s(m,r)){V.value=``,V.focus();return}t(m,r),n(`state:changed`),c(m),V.value=``,H()}},F.addEventListener(`click`,r=>{(async()=>{let o=r.target;if(!o)return;let d=o.closest(`.picker-remove-btn`);if(d?.dataset.name){let t=d.dataset.name,r=s(m,t);if(!r)return;let i=()=>{a(m,t),n(`state:changed`),c(m),r.linkedUserId&&_(m.id,r.linkedUserId),H()},{balances:o}=E(m),l=o[t]??0;if(Math.abs(l)>.01){let n=f();e({title:u(`companions.removeWithBalanceTitle`),message:l>0?u(`companions.removeWithBalanceOwed`,{name:t,amount:T(l,n)}):u(`companions.removeWithBalanceOwes`,{name:t,amount:T(Math.abs(l),n)}),confirmText:u(`common.remove`),onConfirm:i})}else r.linkedUserId?e({title:u(`companions.removeConfirmTitle`),message:u(`companions.removeConfirmBody`,{name:t}),confirmText:u(`common.remove`),onConfirm:i}):i();return}let p=o.closest(`.picker-unlink-btn`);if(p?.dataset.name){let e=s(m,p.dataset.name);e&&delete e.linkedUserId,n(`state:changed`),c(m),H();return}let g=o.closest(`.picker-link-btn`);if(g?.dataset.name){R.hidden=!1,R.dataset.linkTargetName=g.dataset.name,B&&(B.textContent=u(`companions.linkSheetTitle`)),j.length===0&&(j=await i()),U();return}if(o.closest(`.picker-link-self-btn`)){let e=R.dataset.linkTargetName;if(e&&w){let t=s(m,e);t&&(t.linkedUserId=w,y(m,w,t.name,k)),delete R.dataset.linkTargetName,n(`state:changed`),c(m),R.hidden=!0,H()}return}let v=o.closest(`.picker-friend-add-btn`);if(v){let e=v.closest(`.picker-friend-row`);if(!e?.dataset.friendId)return;let r=e.dataset.friendId,i=e.dataset.friendName||`Friend`,a=e.querySelector(`.picker-friend-role-select`)?.value||`relaxer`,o=await l(m.id,r,a);if(!o.ok){h(o.status===409?u(`companions.inviteRoleConflict`,{name:i}):o.status===404?u(`companions.inviteUnavailable`,{name:i}):u(`companions.inviteFailed`,{name:i}));return}let d=R.dataset.linkTargetName,f=i;if(d){let e=s(m,d);e&&(e.linkedUserId=r,f=e.name),delete R.dataset.linkTargetName}else{let e=s(m,i);e&&!e.linkedUserId?(e.linkedUserId=r,f=e.name):f=t(m,i,r).name}y(m,r,f,k),n(`state:changed`),c(m),R.hidden=!0,H(),h(u(`companions.invitedToast`,{name:i,role:M(a)}),`success`)}})()})},O=e=>{let t=r.trips.find(t=>t.id===e);if(!t)return;let n=t.members||[],i=n.find(e=>e.userId===t.ownerId),a=n.filter(e=>e.userId!==t.ownerId),o=e=>e===`planner`?u(`companions.rolePlanner`):e===`budgeteer`?u(`companions.roleBudgeteer`):e===`relaxer`?u(`companions.roleRelaxer`):e,s=(e,t)=>`
        <div class="companion-row" style="cursor: default;">
            ${e.picture?`<img src="${d(e.picture)}" alt="" referrerpolicy="no-referrer" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">`:``}
            <span class="companion-row__name">${d(e.name||e.userId)}</span>
            <span class="companion-link-pill ${t?`companion-link-pill--linked`:`companion-link-pill--pending`}">
                ${d(t?u(`companions.membersOwnerBadge`):o(e.role))}
            </span>
        </div>
    `,{root:c,close:l}=g({variant:`glass-light`,cardStyle:`width: min(460px, calc(100vw - 24px)); max-width: 100%; max-height: 85vh; display: flex; flex-direction: column;`,innerHTML:`
            <h2 style="margin: 0 0 var(--space-2); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${d(u(`companions.membersTitle`))}</h2>
            <p style="margin: 0 0 var(--space-5); font-size: var(--font-base); color: rgba(0,0,0,0.55);">
                ${u(`companions.membersIntro`,{trip:d(t.name),role:d(o(t.myRole||`relaxer`))})}
            </p>

            <div style="display: flex; flex-direction: column; gap: var(--space-2); overflow-y: auto; padding: var(--space-1); margin-bottom: var(--space-5); flex: 1; min-height: 0;">
                ${i?s(i,!0):``}
                ${a.map(e=>s(e,!1)).join(``)}
            </div>

            <div style="display: flex; gap: var(--space-3); flex-shrink: 0;">
                <button id="tripMembersCloseBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">${d(u(`companions.closeBtn`))}</button>
            </div>
        `});C(c,`#tripMembersCloseBtn`).onclick=()=>l()},k=()=>{if(!r.activeTripId){h(u(`modals.addDayErrorNoTrip`));return}let e=(r.tripDays||[]).filter(e=>e.tripId===r.activeTripId).sort((e,t)=>e.dayNumber-t.dayNumber),t=e.filter(e=>e.dayNumber>0),i=(t.length>0?t[t.length-1].dayNumber:0)+1,a=``;if(e.length>0){let t=e[e.length-1];if(t.date){let e=new Date(t.date+`T00:00:00Z`);e.setUTCDate(e.getUTCDate()+1),a=e.toISOString().split(`T`)[0]??``}}let{root:s,close:c}=g({variant:`glass-light`,cardStyle:`width: 400px;`,innerHTML:`
            <div style="display: flex; align-items: center; justify-content: center; gap: var(--space-3); margin-bottom: var(--space-5);">
                <div style="background: var(--accent-blue); color: white; width: 28px; height: 28px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: var(--font-base);">${i}</div>
                <h2 class="card-title" style="font-size: var(--font-3xl); margin: 0; color: #000000; letter-spacing: -0.06em; font-weight: 800; text-align: center;">${d(u(`modals.addDayTitle`))}</h2>
            </div>
            <form id="addDayForm" style="display: flex; flex-direction: column; width: 100%;">
                <div class="mb-4">
                    <label class="form-label text-black/50" for="dayName">${d(u(`modals.addDayLabelWhere`))}</label>
                    <input type="text" id="dayName" class="glass-input-modal mdl-btn-dark" value="${d(u(`tripMedia.dayBucketDay`,{n:i}))}" placeholder="${d(u(`modals.addDayPlaceholderWhere`))}" required autofocus>
                </div>
                <div style="margin-bottom: var(--space-6);">
                    <label class="form-label text-black/50" for="dayDate">${d(u(`modals.addDayLabelDate`))} ${a?d(u(`modals.addDayDateAuto`)):``}</label>
                    <input type="date" id="dayDate" class="glass-input-modal mdl-btn-dark" value="${a}" required>
                </div>
                <div style="display: flex; gap: var(--space-2); width: 100%;">
                    <button type="submit" class="btn-primary flex-[2]">${d(u(`modals.addDayConfirmBtn`))}</button>
                    <button type="button" id="cancelDayBtn" class="btn-ghost" style="flex: 1; background: rgba(0,0,0,0.05); color: #000; border: none;">${d(u(`modals.addDayCancelBtn`))}</button>
                </div>
            </form>
        `}),l=r.activeTripId;C(s,`#cancelDayBtn`).onclick=()=>c(),C(s,`#addDayForm`).onsubmit=async e=>{e.preventDefault();let t={id:m(),tripId:l,name:C(s,`#dayName`).value,date:C(s,`#dayDate`).value,dayNumber:i,photos:[],notes:``,plan:{morning:``,afternoon:``,evening:``}};r.tripDays.push(t),n(`state:changed`);let a=await o(t);if(a&&!a.ok){let e=a.status||`no-response`,n=a.body?.error||``;h(u(`modals.addDayErrorServerSave`,{status:n?`${e} · ${n}`:String(e)})),console.error(`[upsertDay] failed`,{dayId:t.id,status:e,body:a.body})}c(),w(`home`)}};export{D as n,O as r,k as t};
//# sourceMappingURL=modals-CblPitg6.js.map