import{r as e,t}from"./vendor-react-CYVQMBjw.js";import{B as n,G as r,K as i,X as a,a as o,c as s,d as c,h as l,i as u,l as d,q as f,s as p,t as m,u as h,v as g,y as _}from"../app.bundle.js";var v=e(),y=new Set([`friend_shared_trip`,`friend_reposted_trip`]),b=new Set([`friend_created_trip`,`friend_archived_trip`,`friend_joined_trip`,`new_friendship`]),x={muted:`142,142,147`,like:`255,59,48`,comment:`0,113,227`,repost:`52,199,89`,bookmark:`255,149,0`};function S(e){if(!e)return``;let t=typeof e==`string`&&e.includes(` `)&&!e.includes(`T`)?e.replace(` `,`T`)+`Z`:e,n=new Date(t);return Number.isNaN(n.getTime())?``:n.toISOString().slice(0,10)}function C(e){let t=new Map,n=[];for(let r of e){if(y.has(r.type)){n.push(r);continue}let e=`${r.actor?.id||`anon`}|${r.type}|${S(r.when)}`,i=t.get(e);i||(i=[],t.set(e,i),n.push({__slot:e})),i.push(r)}return n.map(e=>{let n=e.__slot;if(!n)return e;let r=t.get(n)||[];if(r.length===1)return r[0];let i=r[0];return{bundled:!0,id:`bundle_${n}`,type:i.type,actor:i.actor,when:i.when,members:r}})}function w(e){let t=`<strong style="color:#002d5b;">${n(e.actor.name)}</strong>`,r=e.members.length,i=r===1?`trip`:`trips`;switch(e.type){case`friend_created_trip`:return`${t} started planning <strong style="color:#002d5b;">${r} new ${i}</strong>`;case`friend_archived_trip`:return`${t} just completed <strong style="color:#002d5b;">${r} ${i}</strong> 🎉`;case`friend_joined_trip`:return`${t} joined <strong style="color:#002d5b;">${r} ${i}</strong>`;case`new_friendship`:return`You and <strong style="color:#002d5b;">${r} new people</strong> are now friends 🤝`;default:return`${t} did ${r} new things`}}function T(e,t=44){let r=(e?.name||`?`).charAt(0).toUpperCase(),i=`<div style="width:${t}px; height:${t}px; border-radius:50%; background: var(--gradient-day); color:white; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:${Math.round(t*.4)}px; flex-shrink:0; box-shadow: 0 2px 8px rgba(0,113,227,0.18);">${n(r)}</div>`,a=e?.picture?`<img src="${n(e.picture)}" alt="" referrerpolicy="no-referrer"
            onerror="this.outerHTML=this.dataset.fallback;"
            data-fallback="${n(i)}"
            style="width:${t}px; height:${t}px; border-radius:50%; object-fit:cover; flex-shrink:0; border:2px solid rgba(255,255,255,0.6); box-shadow: 0 2px 8px rgba(0,45,91,0.12);">`:i;return e?.id?`<button type="button" class="feed-avatar-btn" data-feed-avatar-user-id="${n(e.id)}"
        title="View ${n(e.name||`profile`)}"
        aria-label="View ${n(e.name||`profile`)}'s profile"
        style="background:transparent; border:0; padding:0; margin:0; cursor:pointer; line-height:0; flex-shrink:0; border-radius:50%;">${a}</button>`:a}function E(e){if(!e)return``;let t=typeof e==`string`&&e.includes(` `)&&!e.includes(`T`)?e.replace(` `,`T`)+`Z`:e,n=new Date(t).getTime();if(Number.isNaN(n))return``;let r=Date.now()-n,i=Math.floor(r/1e3);if(i<60)return`just now`;let a=Math.floor(i/60);if(a<60)return`${a}m ago`;let o=Math.floor(a/60);if(o<24)return`${o}h ago`;let s=Math.floor(o/24);return s<7?`${s}d ago`:new Date(n).toLocaleDateString(`en-US`,{month:`short`,day:`numeric`})}function D(e){let t=a.user?.id,r=t&&e.actor?.id===t?`<strong style="color:#002d5b;">You</strong>`:`<strong style="color:#002d5b;">${n(e.actor.name)}</strong>`,i=e.trip?`<strong style="color:#002d5b;">${n(e.trip.name||e.trip.country||`a trip`)}</strong>`:``;switch(e.type){case`friend_created_trip`:return`${r} started planning a new trip — ${i}${e.trip?.country?` (${n(e.trip.country)})`:``}`;case`friend_archived_trip`:return`${r} just completed their trip to <strong style="color:#002d5b;">${n(e.trip?.country||e.trip?.name||`somewhere`)}</strong> 🎉`;case`friend_joined_trip`:return`${r} joined the trip ${i}`;case`new_friendship`:return`You and ${r} are now friends 🤝`;case`friend_shared_trip`:return`${r} shared a trip — ${i}${e.trip?.country?` (${n(e.trip.country)})`:``}`;case`friend_reposted_trip`:{let a=!!t&&e.original_sharer?.id===t;return`${r} reposted ${e.original_sharer?a?`<strong style="color:#002d5b;">your</strong> share`:`<strong style="color:#002d5b;">${n(e.original_sharer.name)}</strong>'s trip`:`someone`} — ${i}${e.trip?.country?` (${n(e.trip.country)})`:``}`}default:return`${r} did something new`}}function O(e){switch(e){case`friend_created_trip`:return{color:`#0071e3`,icon:`🗺️`};case`friend_archived_trip`:return{color:`#34c759`,icon:`🏁`};case`friend_joined_trip`:return{color:`#ff9500`,icon:`👥`};case`new_friendship`:return{color:`#9b59b6`,icon:`🤝`};case`friend_shared_trip`:return{color:`#5856d6`,icon:`📣`};case`friend_reposted_trip`:return{color:`#5856d6`,icon:`🔁`};default:return{color:`#8e8e93`,icon:`✨`}}}function k(e,t=!1){let n=t?` fill="currentColor"`:``,r=``;switch(e){case`heart`:r=`<path${n} d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>`;break;case`comment`:r=`<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>`;break;case`repost`:r=`<polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path>`;break;case`bookmark`:r=`<path${n} d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>`;break}return`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`+r+`</svg>`}function A(e){let t=`display:inline-flex; align-items:center; gap:6px;${e.marginLeftAuto?` margin-left:auto;`:``}`,n=e.countThreshold??1,r=typeof e.count==`number`,i=r&&e.count>=n?String(e.count):``;return`
        <span style="${t}">
            <button type="button" class="icon-btn-circle ${e.className}" style="--accent: ${e.accent};" ${e.dataAttrs||``} title="${e.title}" aria-label="${e.title}">
                ${e.svg}
            </button>
            ${r?`<span class="feed-action-count" data-threshold="${n}" style="font-size:0.78rem; color:var(--text-secondary); font-weight:700; min-width:0.8em;">${i}</span>`:``}
        </span>
    `}function j(e){let t=y.has(e.type),r=!!e.is_bookmarked,i=A({className:`feed-bookmark-btn`,accent:r?x.bookmark:x.muted,dataAttrs:`data-event-id="${n(e.id)}" data-bookmarked="${r?`1`:`0`}"`,title:r?`Remove bookmark`:`Bookmark`,svg:k(`bookmark`,r),marginLeftAuto:!0});if(!t)return`
            <div class="feed-actions" style="display:flex; align-items:center; gap:10px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(0,45,91,0.06);">
                ${i}
            </div>
        `;let a=!!e.is_liked,o=e.like_count||0,s=e.comment_count||0,c=!!e.post_id;return`
        <div class="feed-actions" style="display:flex; align-items:center; gap:10px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(0,45,91,0.06);">
            ${A({className:`feed-like-btn`,accent:a?x.like:x.muted,dataAttrs:`data-event-id="${n(e.id)}" data-liked="${a?`1`:`0`}"`,title:a?`Unlike`:`Like`,svg:k(`heart`,a),count:o,countThreshold:3})}
            ${A({className:`feed-comment-btn`,accent:x.comment,dataAttrs:`data-event-id="${n(e.id)}"`,title:`Comments`,svg:k(`comment`),count:s})}
            ${c?A({className:`feed-repost-btn`,accent:x.muted,dataAttrs:`data-post-id="${e.post_id}"`,title:`Repost to your friends`,svg:k(`repost`)}):``}
            ${i}
        </div>
        <div class="feed-thread" data-event-id="${n(e.id)}" data-loaded="0" style="display:none; margin-top:10px; padding-top:10px; border-top:1px solid rgba(0,45,91,0.06);"></div>
    `}function M(e,t){return`
        <div class="feed-comment-row" data-comment-id="${e.id}" style="display:flex; align-items:flex-start; gap:10px; padding:8px 0; border-bottom:1px dashed rgba(0,45,91,0.06);">
            ${T(e.author,32)}
            <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
                    <strong style="color:#002d5b; font-size:0.85rem;">${n(e.author?.name||`Someone`)}</strong>
                    <span style="font-size:0.7rem; color:var(--text-secondary); font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">${n(E(e.when))}</span>
                </div>
                <div style="font-size:0.88rem; color:#002d5b; line-height:1.4; margin-top:2px; white-space:pre-wrap; word-wrap:break-word;">${n(e.body||``)}</div>
            </div>
            ${t?`
                <button type="button" class="feed-comment-delete-btn" data-comment-id="${e.id}" title="Delete your comment" aria-label="Delete comment"
                    style="background:transparent; border:0; color:rgba(255,59,48,0.6); cursor:pointer; padding:2px 6px; font-size:0.72rem; font-weight:800; flex-shrink:0;">✕</button>`:``}
        </div>
    `}var N=new Set;function P(e){e.classList.remove(`tap-pop`),e.offsetWidth,e.classList.add(`tap-pop`),e.addEventListener(`animationend`,()=>{e.classList.remove(`tap-pop`)},{once:!0})}var F=[],I={},L=`posts`,R=!1;function z(e,t,r){let i=a.user?.id;e.innerHTML=`
        <div class="feed-comment-list">${r.length>0?r.map(e=>M(e,e.author?.id===i)).join(``):`<div style="font-size:0.82rem; color:var(--text-secondary); padding:6px 0;">No comments yet — be the first.</div>`}</div>
        <form class="feed-comment-form" data-event-id="${n(t)}" style="display:flex; gap:8px; margin-top:10px;">
            <input type="text" name="body" placeholder="Add a comment…" maxlength="500" autocomplete="off"
                style="flex:1; min-width:0; padding:8px 12px; border:1px solid rgba(0,45,91,0.12); border-radius:999px; font-size:0.85rem; background:rgba(0,113,227,0.04); color:#002d5b; font-family: inherit;">
            <button type="submit" class="feed-comment-submit" title="Post comment" aria-label="Post comment"
                style="background:var(--accent-blue); color:white; border:0; padding:8px 16px; border-radius:999px; font-size:0.82rem; font-weight:800; cursor:pointer;">Post</button>
        </form>
    `}function B(){let e=document.createElement(`div`);e.style.cssText=`font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',sans-serif;`,e.innerHTML=`
        <div style="max-width: 760px; margin: 0 auto;">
            <div style="padding:32px 0 24px; text-align:center;">
                <h1 style="margin:0 0 6px;font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;background:var(--gradient-title);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Feed</h1>
                <p style="margin:0;color:var(--text-secondary);font-size:1rem;">What your friends are up to lately</p>
            </div>

            <!-- Phase G v3 — class-based layout (was a position:absolute
                 toggle that overlapped the Actions tab on narrow
                 viewports). Desktop keeps the centered tabs + right-
                 anchored toggle; mobile media query in index.css drops
                 the toggle below the tabs row so nothing overlaps. -->
            <div id="feedTabsRow" class="feed-tabs-row">
                <!-- Posts tab gets the share/repost purple (matches the
                     event accent for shares); Actions tab gets orange,
                     borrowed from the friend-joined-trip event accent.
                     Both colours come from the GG palette and read as
                     "different but related" — same visual weight, easy
                     to scan at a glance. --accent is consumed by the
                     home-tabnav--centered CSS rules. -->
                <nav class="home-tabnav home-tabnav--centered" role="tablist" aria-label="Feed sections">
                    <button class="home-tabnav__tab${L===`posts`?` is-active`:``}" data-feed-tab="posts" role="tab" type="button" style="--accent: 88, 86, 214;">Posts</button>
                    <button class="home-tabnav__tab${L===`actions`?` is-active`:``}" data-feed-tab="actions" role="tab" type="button" style="--accent: 255, 149, 0;">Actions</button>
                </nav>
                <label class="apple-toggle feed-tabs-row__bookmark" id="feedBookmarkToggle" title="Filter to bookmarked items only">
                    <input type="checkbox" class="apple-toggle__input" ${R?`checked`:``}>
                    <span class="apple-toggle__track"><span class="apple-toggle__thumb"></span></span>
                    <span class="apple-toggle__label">🔖 Bookmarked</span>
                </label>
            </div>

            <div id="feedList" style="display:flex; flex-direction:column; gap:12px;"></div>
        </div>
    `;let t=!1,_=()=>{let i=r(e,`#feedList`);if(!i)return;if(!t&&F.length===0){i.innerHTML=`
                <div class="card glass" style="padding: 32px; border-radius: 24px; text-align:center;">
                    <div class="spinner-ring" style="width:32px; height:32px; border:3px solid rgba(155,89,182,0.18); border-top-color:#7c3a9e; border-radius:50%; animation:spin 1s linear infinite; margin: 0 auto 14px;"></div>
                    <div style="color: var(--text-secondary); font-size: 0.88rem; font-weight: 600;">Loading the feed…</div>
                </div>
            `;return}let o=e=>L===`posts`?y.has(e.type):b.has(e.type),s=F.filter(e=>!(!o(e)||R&&!e.is_bookmarked));if(s.length===0){let t,r,a,o;R?(t=L===`posts`?`No bookmarked posts yet`:`No bookmarked actions yet`,r=`Tap 🔖 on any card to save it for later — bookmarks are private and never expire.`,a=`Show all`,o=()=>{R=!1;let t=e.querySelector(`#feedBookmarkToggle .apple-toggle__input`);t&&(t.checked=!1),_()}):L===`posts`?(t=`No posts yet`,r=`Posts are trips your friends shared (or reposted) for the world to see. Share one of your own from the trip header to kick things off — or check the <strong>Actions</strong> tab for what's been happening behind the scenes.`,a=`See Actions`,o=()=>{L=`actions`,_(),e.querySelectorAll(`.home-tabnav__tab`).forEach(e=>e.classList.toggle(`is-active`,e.dataset.feedTab===`actions`))}):(t=`Quiet over here`,r=`When your friends create trips, complete adventures or join in on plans, you'll see it here. Add more friends in <strong>Your network</strong> to grow the feed.`,a=`Go to Your network`,o=()=>l(`friends`)),i.innerHTML=`
                <div class="card glass" style="padding: 32px; border-radius: 24px; border: 1.5px dashed rgba(155, 89, 182, 0.35); background: rgba(155, 89, 182, 0.04); text-align:center;">
                    <div style="font-size:2.4rem; margin-bottom:10px;">${R?`🔖`:`🌱`}</div>
                    <h3 style="margin:0 0 8px; color:#7c3a9e; font-weight:800; font-size: 1.1rem;">${n(t)}</h3>
                    <p style="margin:0; color:var(--text-secondary); font-size:0.9rem; line-height:1.5;">${r}</p>
                    <button id="feedEmptyCtaBtn" class="btn-primary" style="margin-top: 16px; padding: 10px 22px; border-radius: 999px;">${n(a)}</button>
                </div>
            `;let s=i.querySelector(`#feedEmptyCtaBtn`);s&&(s.onclick=o);return}let c=a.user?.id;i.innerHTML=C(s).map(e=>{if(e.bundled){let t=e,r=O(t.type),i=E(t.when),a=N.has(t.id),o=t.members.map(e=>{let t=D(e),r=!!e.is_bookmarked;return`
                        <div class="feed-bundle-member" data-event-id="${n(e.id)}" style="display:flex; align-items:center; gap:10px; padding:8px 0; border-top:1px dashed rgba(0,45,91,0.06);">
                            <div style="flex:1; min-width:0; font-size:0.88rem; color:var(--text-secondary); line-height:1.4;">${t}</div>
                            <button type="button" class="icon-btn-circle feed-bookmark-btn" style="--accent: ${r?x.bookmark:x.muted};" data-event-id="${n(e.id)}" data-bookmarked="${r?`1`:`0`}" title="${r?`Remove bookmark`:`Bookmark`}" aria-label="${r?`Remove bookmark`:`Bookmark`}">
                                ${k(`bookmark`,r)}
                            </button>
                        </div>
                    `}).join(``);return`
                    <div class="card glass feed-event feed-bundle" data-bundle-id="${n(t.id)}"
                        style="padding: 16px 18px; border-radius: 18px; background: white; border: 1px solid ${r.color}22; border-left: 4px solid ${r.color}; box-shadow: 0 4px 14px rgba(0,45,91,0.06); display:flex; flex-direction:column; gap:0;">
                        <div style="display:flex; align-items:flex-start; gap:14px;">
                            ${T(t.actor)}
                            <div style="flex:1; min-width:0;">
                                <div style="font-size: 0.95rem; line-height:1.4; color: var(--text-secondary);">
                                    <span style="margin-right:6px;">${r.icon}</span>${w(t)}
                                </div>
                                ${i?`<div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;">${n(i)}</div>`:``}
                            </div>
                            <button type="button" class="feed-bundle-toggle" data-bundle-id="${n(t.id)}"
                                style="background:transparent; border:0; color:#005bb8; cursor:pointer; padding:4px 10px; font-size:0.78rem; font-weight:800; flex-shrink:0;">${a?`Collapse`:`View all`}</button>
                        </div>
                        <div class="feed-bundle-members" style="margin-top: ${a?`8px`:`0`}; padding-top: ${a?`4px`:`0`}; display: ${a?`block`:`none`};">
                            ${o}
                        </div>
                    </div>
                `}let t=e,r=O(t.type),i=E(t.when),a=t.caption?`
                <div style="margin-top:10px; padding:10px 12px; background:rgba(88,86,214,0.06); border-radius:12px; font-size:0.92rem; color:#002d5b; line-height:1.45; white-space:pre-wrap; word-wrap:break-word;">${n(t.caption)}</div>
            `:``,o=(t.type===`friend_shared_trip`||t.type===`friend_reposted_trip`)&&t.trip?.id?(()=>{let e=t.trip.country?n(t.trip.country):``;return`
                    <button type="button" class="feed-trip-card" data-trip-id="${n(t.trip.id)}"
                        style="margin-top:10px; width:100%; text-align:left; background:white; border:1px solid rgba(88,86,214,0.22); border-left:4px solid #5856d6; border-radius:14px; padding:12px 14px; cursor:pointer; display:flex; align-items:center; gap:12px; box-shadow:0 2px 8px rgba(0,45,91,0.04); transition: transform 0.15s ease, box-shadow 0.15s ease;">
                        <span style="font-size:1.6rem; line-height:1; flex-shrink:0;">🗺️</span>
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight:800; color:#002d5b; font-size:0.98rem; line-height:1.25; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${n(t.trip.name||`Trip`)}</div>
                            ${e?`<div style="font-size:0.78rem; color:var(--text-secondary); font-weight:600; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📍 ${e}</div>`:``}
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="color:#5856d6; flex-shrink:0;"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                `})():``,s=t.type===`friend_shared_trip`&&t.actor?.id===c&&t.post_id?`
                <button type="button" class="feed-unshare-btn" data-post-id="${t.post_id}" title="Unshare — removes from your friends' feeds" aria-label="Unshare"
                    style="background:transparent; border:0; color:rgba(255,59,48,0.55); cursor:pointer; padding:2px 6px; font-size:0.85rem; font-weight:800; flex-shrink:0; line-height:1;">✕</button>
            `:``;return`
                <div class="card glass feed-event" data-event-id="${n(t.id)}"
                    style="padding: 16px 18px; border-radius: 18px; background: white; border: 1px solid ${r.color}22; border-left: 4px solid ${r.color}; box-shadow: 0 4px 14px rgba(0,45,91,0.06); display:flex; flex-direction:column; gap:0;">
                    <div style="display:flex; align-items:flex-start; gap:14px;">
                        ${T(t.actor)}
                        <div style="flex:1; min-width:0;">
                            <div style="font-size: 0.95rem; line-height:1.4; color: var(--text-secondary);">
                                <span style="margin-right:6px;">${r.icon}</span>${D(t)}
                            </div>
                            ${i?`<div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;">${n(i)}</div>`:``}
                        </div>
                        ${s}
                    </div>
                    ${a}
                    ${o}
                    ${j(t)}
                </div>
            `}).join(``)},v=async()=>{if(!a.user){t=!0,_();return}try{let e=await m(`/api/feed`);if(!e.ok)return;let t=await e.json();Array.isArray(t)&&(F=t)}catch(e){console.error(`Feed refresh failed:`,e)}finally{t=!0,_()}};e.querySelectorAll(`.home-tabnav__tab[data-feed-tab]`).forEach(t=>{t.onclick=()=>{let n=t.dataset.feedTab;!n||L===n||(L=n,e.querySelectorAll(`.home-tabnav__tab[data-feed-tab]`).forEach(e=>{e.classList.toggle(`is-active`,e.dataset.feedTab===n)}),_())}});let S=e.querySelector(`#feedBookmarkToggle .apple-toggle__input`);return S&&S.addEventListener(`change`,()=>{R=!!S.checked,_()}),e.addEventListener(`click`,async e=>{let t=e.target;if(!t)return;let n=t.closest(`.feed-avatar-btn`);if(n?.dataset.feedAvatarUserId){l(`profile`,{userId:n.dataset.feedAvatarUserId});return}let r=t.closest(`.feed-trip-card`);if(r?.dataset.tripId){g(r.dataset.tripId);return}let a=t.closest(`.feed-like-btn`);if(a?.dataset.eventId){let e=a.dataset.eventId,t=a.dataset.liked===`1`,n=!t,r=F.find(t=>t.id===e);r&&(r.is_liked=n,r.like_count=Math.max(0,(r.like_count||0)+(t?-1:1))),a.dataset.liked=n?`1`:`0`,a.style.setProperty(`--accent`,n?x.like:x.muted),a.innerHTML=k(`heart`,n),P(a);let i=a.parentElement?.querySelector(`.feed-action-count`),o=e=>e>=3?String(e):``;i&&r&&(i.textContent=o(r.like_count??0));let s=await h(e);s.ok&&s.body&&r&&(r.is_liked=!!s.body.liked,r.like_count=Number(s.body.count)||0,i&&(i.textContent=o(r.like_count)));return}let p=t.closest(`.feed-bookmark-btn`);if(p?.dataset.eventId){let e=p.dataset.eventId,t=p.dataset.bookmarked!==`1`,n=F.find(t=>t.id===e);n&&(n.is_bookmarked=t),p.dataset.bookmarked=t?`1`:`0`,p.style.setProperty(`--accent`,t?x.bookmark:x.muted),p.innerHTML=k(`bookmark`,t),P(p),R&&!t&&_(),await d(e);return}let m=t.closest(`.feed-bundle-toggle`);if(m?.dataset.bundleId){let e=m.dataset.bundleId;N.has(e)?N.delete(e):N.add(e),_();return}let y=t.closest(`.feed-comment-btn`);if(y?.dataset.eventId){let e=y.dataset.eventId,t=y.closest(`.feed-event`)?.querySelector(`.feed-thread`);if(!t)return;if(t.style.display!==`none`){t.style.display=`none`;return}t.style.display=`block`,I[e]?z(t,e,I[e]):(t.innerHTML=`<div style="font-size:0.82rem; color:var(--text-secondary); padding:6px 0;">Loading…</div>`,I[e]=await o(e)||[],z(t,e,I[e]));let n=t.querySelector(`input[name="body"]`);n&&n.focus();return}let b=t.closest(`.feed-comment-delete-btn`);if(b?.dataset.commentId){let e=Number(b.dataset.commentId),t=b.closest(`.feed-comment-row`),n=b.closest(`.feed-thread`),r=n?.dataset.eventId;t&&t.remove(),r&&I[r]&&(I[r]=I[r].filter(t=>t.id!==e));let i=r?F.find(e=>e.id===r):null;if(i){i.comment_count=Math.max(0,(i.comment_count||0)-1);let e=((n?.closest(`.feed-event`))?.querySelector(`.feed-comment-btn`))?.parentElement?.querySelector(`.feed-action-count`);e&&(e.textContent=i.comment_count>0?String(i.comment_count):``)}(await u(e)).ok||f(`Couldn't delete — try again in a moment.`);return}let S=t.closest(`.feed-unshare-btn`);if(S?.dataset.postId){let e=Number(S.dataset.postId);i({title:`Unshare this trip?`,message:`It'll disappear from your friends' feeds. Any reposts of it will be removed too. This can't be undone.`,confirmText:`Unshare`,onConfirm:async()=>{let t=await c(e);if(!t||!t.ok){f(`Couldn't unshare — try again in a moment.`);return}await v(),f(`Removed from your feed.`)}});return}let C=t.closest(`.feed-repost-btn`);if(C?.dataset.postId){let e=Number(C.dataset.postId),t=C.style.getPropertyValue(`--accent`)||x.muted;C.disabled=!0,C.style.setProperty(`--accent`,x.muted);let n=await s(e);n.ok&&n.body?.status!==`same_user`?(f(n.body?.status===`already_reposted`?`Already reposted`:`Reposted to your feed`),C.style.setProperty(`--accent`,x.repost),C.innerHTML=`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`,P(C)):n.body?.status===`same_user`?(C.disabled=!1,C.style.setProperty(`--accent`,t),f(`That's your own share — no need to repost it.`)):(C.disabled=!1,C.style.setProperty(`--accent`,t),f(`Repost failed — try again in a moment.`));return}}),e.addEventListener(`submit`,async e=>{let t=e.target;if(!t?.classList?.contains(`feed-comment-form`))return;e.preventDefault();let n=t.dataset.eventId;if(!n)return;let r=t.querySelector(`input[name="body"]`),i=r?.value.trim();if(!i)return;let a=t.querySelector(`.feed-comment-submit`);r&&(r.value=``),a&&(a.disabled=!0);let o=await p(n,i);if(a&&(a.disabled=!1),!o.ok||!o.body?.comment){r&&(r.value=i),f(`Couldn't post comment — try again.`);return}let s=o.body.comment;I[n]||(I[n]=[]),I[n].push(s);let c=t.closest(`.feed-thread`);c&&z(c,n,I[n]);let l=c?.querySelector(`input[name="body"]`);l&&l.focus();let u=F.find(e=>e.id===n);if(u){u.comment_count=(u.comment_count||0)+1;let e=((c?.closest(`.feed-event`))?.querySelector(`.feed-comment-btn`))?.parentElement?.querySelector(`.feed-action-count`);e&&(e.textContent=String(u.comment_count))}}),_(),v(),e}var V=t();function H(){let e=(0,v.useRef)(null);return(0,v.useEffect)(()=>{let t=e.current;t&&(t.innerHTML=``,t.appendChild(B()))},[]),(0,V.jsx)(`div`,{ref:e})}function U(e){_(e,(0,v.createElement)(H))}export{U as mountFeed};
//# sourceMappingURL=mount-DjNV7ovR.js.map