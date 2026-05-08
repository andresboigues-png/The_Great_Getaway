import{r as e,t}from"./vendor-react-CYVQMBjw.js";import{H as n,L as r,U as i,W as a,a as o,c as s,d as c,h as l,i as u,l as d,q as f,s as p,t as m,u as h,v as g,y as _}from"../app.bundle.js";var v=e(),y=new Set([`friend_shared_trip`,`friend_reposted_trip`]),b=new Set([`friend_created_trip`,`friend_archived_trip`,`friend_joined_trip`,`new_friendship`]),x={muted:`142,142,147`,like:`255,59,48`,comment:`0,113,227`,repost:`52,199,89`,bookmark:`255,149,0`};function S(e){if(!e)return``;let t=typeof e==`string`&&e.includes(` `)&&!e.includes(`T`)?e.replace(` `,`T`)+`Z`:e,n=new Date(t);return Number.isNaN(n.getTime())?``:n.toISOString().slice(0,10)}function C(e){let t=new Map,n=[];for(let r of e){if(y.has(r.type)){n.push(r);continue}let e=`${r.actor?.id||`anon`}|${r.type}|${S(r.when)}`,i=t.get(e);i||(i=[],t.set(e,i),n.push({__slot:e})),i.push(r)}return n.map(e=>{let n=e.__slot;if(!n)return e;let r=t.get(n)||[];if(r.length===1)return r[0];let i=r[0];return{bundled:!0,id:`bundle_${n}`,type:i.type,actor:i.actor,when:i.when,members:r}})}function w(e){let t=`<strong style="color:#002d5b;">${r(e.actor.name)}</strong>`,n=e.members.length,i=n===1?`trip`:`trips`;switch(e.type){case`friend_created_trip`:return`${t} started planning <strong style="color:#002d5b;">${n} new ${i}</strong>`;case`friend_archived_trip`:return`${t} just completed <strong style="color:#002d5b;">${n} ${i}</strong> 🎉`;case`friend_joined_trip`:return`${t} joined <strong style="color:#002d5b;">${n} ${i}</strong>`;case`new_friendship`:return`You and <strong style="color:#002d5b;">${n} new people</strong> are now friends 🤝`;default:return`${t} did ${n} new things`}}function T(e,t=44){let n=(e?.name||`?`).charAt(0).toUpperCase(),i=`<div style="width:${t}px; height:${t}px; border-radius:50%; background: var(--gradient-day); color:white; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:${Math.round(t*.4)}px; flex-shrink:0; box-shadow: 0 2px 8px rgba(0,113,227,0.18);">${r(n)}</div>`,a=e?.picture?`<img src="${r(e.picture)}" alt="" referrerpolicy="no-referrer"
            onerror="this.outerHTML=this.dataset.fallback;"
            data-fallback="${r(i)}"
            style="width:${t}px; height:${t}px; border-radius:50%; object-fit:cover; flex-shrink:0; border:2px solid rgba(255,255,255,0.6); box-shadow: 0 2px 8px rgba(0,45,91,0.12);">`:i;return e?.id?`<button type="button" class="feed-avatar-btn" data-feed-avatar-user-id="${r(e.id)}"
        title="View ${r(e.name||`profile`)}"
        aria-label="View ${r(e.name||`profile`)}'s profile"
        style="background:transparent; border:0; padding:0; margin:0; cursor:pointer; line-height:0; flex-shrink:0; border-radius:50%;">${a}</button>`:a}function E(e){if(!e)return``;let t=typeof e==`string`&&e.includes(` `)&&!e.includes(`T`)?e.replace(` `,`T`)+`Z`:e,n=new Date(t).getTime();if(Number.isNaN(n))return``;let r=Date.now()-n,i=Math.floor(r/1e3);if(i<60)return`just now`;let a=Math.floor(i/60);if(a<60)return`${a}m ago`;let o=Math.floor(a/60);if(o<24)return`${o}h ago`;let s=Math.floor(o/24);return s<7?`${s}d ago`:new Date(n).toLocaleDateString(`en-US`,{month:`short`,day:`numeric`})}function D(e){let t=f.user?.id,n=t&&e.actor?.id===t?`<strong style="color:#002d5b;">You</strong>`:`<strong style="color:#002d5b;">${r(e.actor.name)}</strong>`,i=e.trip?`<strong style="color:#002d5b;">${r(e.trip.name||e.trip.country||`a trip`)}</strong>`:``;switch(e.type){case`friend_created_trip`:return`${n} started planning a new trip — ${i}${e.trip?.country?` (${r(e.trip.country)})`:``}`;case`friend_archived_trip`:return`${n} just completed their trip to <strong style="color:#002d5b;">${r(e.trip?.country||e.trip?.name||`somewhere`)}</strong> 🎉`;case`friend_joined_trip`:return`${n} joined the trip ${i}`;case`new_friendship`:return`You and ${n} are now friends 🤝`;case`friend_shared_trip`:return`${n} shared a trip — ${i}${e.trip?.country?` (${r(e.trip.country)})`:``}`;case`friend_reposted_trip`:{let a=!!t&&e.original_sharer?.id===t;return`${n} reposted ${e.original_sharer?a?`<strong style="color:#002d5b;">your</strong> share`:`<strong style="color:#002d5b;">${r(e.original_sharer.name)}</strong>'s trip`:`someone`} — ${i}${e.trip?.country?` (${r(e.trip.country)})`:``}`}default:return`${n} did something new`}}function O(e){switch(e){case`friend_created_trip`:return{color:`#0071e3`,icon:`🗺️`};case`friend_archived_trip`:return{color:`#34c759`,icon:`🏁`};case`friend_joined_trip`:return{color:`#ff9500`,icon:`👥`};case`new_friendship`:return{color:`#9b59b6`,icon:`🤝`};case`friend_shared_trip`:return{color:`#5856d6`,icon:`📣`};case`friend_reposted_trip`:return{color:`#5856d6`,icon:`🔁`};default:return{color:`#8e8e93`,icon:`✨`}}}function k(e,t=!1){let n=t?` fill="currentColor"`:``,r=``;switch(e){case`heart`:r=`<path${n} d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>`;break;case`comment`:r=`<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>`;break;case`repost`:r=`<polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path>`;break;case`bookmark`:r=`<path${n} d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>`;break}return`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`+r+`</svg>`}function A(e){let t=`display:inline-flex; align-items:center; gap:6px;${e.marginLeftAuto?` margin-left:auto;`:``}`,n=e.countThreshold??1,r=typeof e.count==`number`,i=r&&e.count>=n?String(e.count):``;return`
        <span style="${t}">
            <button type="button" class="icon-btn-circle ${e.className}" style="--accent: ${e.accent};" ${e.dataAttrs||``} title="${e.title}" aria-label="${e.title}">
                ${e.svg}
            </button>
            ${r?`<span class="feed-action-count" data-threshold="${n}" style="font-size:0.78rem; color:var(--text-secondary); font-weight:700; min-width:0.8em;">${i}</span>`:``}
        </span>
    `}function j(e){let t=y.has(e.type),n=!!e.is_bookmarked,i=A({className:`feed-bookmark-btn`,accent:n?x.bookmark:x.muted,dataAttrs:`data-event-id="${r(e.id)}" data-bookmarked="${n?`1`:`0`}"`,title:n?`Remove bookmark`:`Bookmark`,svg:k(`bookmark`,n),marginLeftAuto:!0});if(!t)return`
            <div class="feed-actions" style="display:flex; align-items:center; gap:10px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(0,45,91,0.06);">
                ${i}
            </div>
        `;let a=!!e.is_liked,o=e.like_count||0,s=e.comment_count||0,c=!!e.post_id;return`
        <div class="feed-actions" style="display:flex; align-items:center; gap:10px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(0,45,91,0.06);">
            ${A({className:`feed-like-btn`,accent:a?x.like:x.muted,dataAttrs:`data-event-id="${r(e.id)}" data-liked="${a?`1`:`0`}"`,title:a?`Unlike`:`Like`,svg:k(`heart`,a),count:o,countThreshold:3})}
            ${A({className:`feed-comment-btn`,accent:x.comment,dataAttrs:`data-event-id="${r(e.id)}"`,title:`Comments`,svg:k(`comment`),count:s})}
            ${c?A({className:`feed-repost-btn`,accent:x.muted,dataAttrs:`data-post-id="${e.post_id}"`,title:`Repost to your friends`,svg:k(`repost`)}):``}
            ${i}
        </div>
        <div class="feed-thread" data-event-id="${r(e.id)}" data-loaded="0" style="display:none; margin-top:10px; padding-top:10px; border-top:1px solid rgba(0,45,91,0.06);"></div>
    `}function M(e,t){return`
        <div class="feed-comment-row" data-comment-id="${e.id}" style="display:flex; align-items:flex-start; gap:10px; padding:8px 0; border-bottom:1px dashed rgba(0,45,91,0.06);">
            ${T(e.author,32)}
            <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
                    <strong style="color:#002d5b; font-size:0.85rem;">${r(e.author?.name||`Someone`)}</strong>
                    <span style="font-size:0.7rem; color:var(--text-secondary); font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">${r(E(e.when))}</span>
                </div>
                <div style="font-size:0.88rem; color:#002d5b; line-height:1.4; margin-top:2px; white-space:pre-wrap; word-wrap:break-word;">${r(e.body||``)}</div>
            </div>
            ${t?`
                <button type="button" class="feed-comment-delete-btn" data-comment-id="${e.id}" title="Delete your comment" aria-label="Delete comment"
                    style="background:transparent; border:0; color:rgba(255,59,48,0.6); cursor:pointer; padding:2px 6px; font-size:0.72rem; font-weight:800; flex-shrink:0;">✕</button>`:``}
        </div>
    `}var N=new Set,P=[],F={},I=`posts`,L=!1;function R(e,t,n){let i=f.user?.id;e.innerHTML=`
        <div class="feed-comment-list">${n.length>0?n.map(e=>M(e,e.author?.id===i)).join(``):`<div style="font-size:0.82rem; color:var(--text-secondary); padding:6px 0;">No comments yet — be the first.</div>`}</div>
        <form class="feed-comment-form" data-event-id="${r(t)}" style="display:flex; gap:8px; margin-top:10px;">
            <input type="text" name="body" placeholder="Add a comment…" maxlength="500" autocomplete="off"
                style="flex:1; min-width:0; padding:8px 12px; border:1px solid rgba(0,45,91,0.12); border-radius:999px; font-size:0.85rem; background:rgba(0,113,227,0.04); color:#002d5b; font-family: inherit;">
            <button type="submit" class="feed-comment-submit" title="Post comment" aria-label="Post comment"
                style="background:var(--accent-blue); color:white; border:0; padding:8px 16px; border-radius:999px; font-size:0.82rem; font-weight:800; cursor:pointer;">Post</button>
        </form>
    `}function z(){let e=document.createElement(`div`);e.style.cssText=`font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',sans-serif;`,e.innerHTML=`
        <div style="max-width: 760px; margin: 0 auto;">
            <div style="padding:32px 0 24px; text-align:center;">
                <h1 style="margin:0 0 6px;font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;background:var(--gradient-title);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Feed</h1>
                <p style="margin:0;color:var(--text-secondary);font-size:1rem;">What your friends are up to lately</p>
            </div>

            <div id="feedTabsRow" style="position:relative; display:flex; align-items:center; justify-content:center; gap:12px; margin-bottom: 16px; flex-wrap: wrap;">
                <!-- Posts tab gets the share/repost purple (matches the
                     event accent for shares); Actions tab gets orange,
                     borrowed from the friend-joined-trip event accent.
                     Both colours come from the GG palette and read as
                     "different but related" — same visual weight, easy
                     to scan at a glance. --accent is consumed by the
                     home-tabnav--centered CSS rules. -->
                <nav class="home-tabnav home-tabnav--centered" role="tablist" aria-label="Feed sections">
                    <button class="home-tabnav__tab${I===`posts`?` is-active`:``}" data-feed-tab="posts" role="tab" type="button" style="--accent: 88, 86, 214;">Posts</button>
                    <button class="home-tabnav__tab${I===`actions`?` is-active`:``}" data-feed-tab="actions" role="tab" type="button" style="--accent: 255, 149, 0;">Actions</button>
                </nav>
                <label class="apple-toggle" id="feedBookmarkToggle" title="Filter to bookmarked items only" style="position:absolute; right:0; top:50%; transform:translateY(-50%);">
                    <input type="checkbox" class="apple-toggle__input" ${L?`checked`:``}>
                    <span class="apple-toggle__track"><span class="apple-toggle__thumb"></span></span>
                    <span class="apple-toggle__label">🔖 Bookmarked</span>
                </label>
            </div>

            <div id="feedList" style="display:flex; flex-direction:column; gap:12px;"></div>
        </div>
    `;let t=()=>{let i=n(e,`#feedList`);if(!i)return;let a=e=>I===`posts`?y.has(e.type):b.has(e.type),o=P.filter(e=>!(!a(e)||L&&!e.is_bookmarked));if(o.length===0){let n,a,o,s;L?(n=I===`posts`?`No bookmarked posts yet`:`No bookmarked actions yet`,a=`Tap 🔖 on any card to save it for later — bookmarks are private and never expire.`,o=`Show all`,s=()=>{L=!1;let n=e.querySelector(`#feedBookmarkToggle .apple-toggle__input`);n&&(n.checked=!1),t()}):I===`posts`?(n=`No posts yet`,a=`Posts are trips your friends shared (or reposted) for the world to see. Share one of your own from the trip header to kick things off — or check the <strong>Actions</strong> tab for what's been happening behind the scenes.`,o=`See Actions`,s=()=>{I=`actions`,t(),e.querySelectorAll(`.home-tabnav__tab`).forEach(e=>e.classList.toggle(`is-active`,e.dataset.feedTab===`actions`))}):(n=`Quiet over here`,a=`When your friends create trips, complete adventures or join in on plans, you'll see it here. Add more friends in <strong>Your network</strong> to grow the feed.`,o=`Go to Your network`,s=()=>l(`friends`)),i.innerHTML=`
                <div class="card glass" style="padding: 32px; border-radius: 24px; border: 1.5px dashed rgba(155, 89, 182, 0.35); background: rgba(155, 89, 182, 0.04); text-align:center;">
                    <div style="font-size:2.4rem; margin-bottom:10px;">${L?`🔖`:`🌱`}</div>
                    <h3 style="margin:0 0 8px; color:#7c3a9e; font-weight:800; font-size: 1.1rem;">${r(n)}</h3>
                    <p style="margin:0; color:var(--text-secondary); font-size:0.9rem; line-height:1.5;">${a}</p>
                    <button id="feedEmptyCtaBtn" class="btn-primary" style="margin-top: 16px; padding: 10px 22px; border-radius: 999px;">${r(o)}</button>
                </div>
            `;let c=i.querySelector(`#feedEmptyCtaBtn`);c&&(c.onclick=s);return}let s=f.user?.id;i.innerHTML=C(o).map(e=>{if(e.bundled){let t=e,n=O(t.type),i=E(t.when),a=N.has(t.id),o=t.members.map(e=>{let t=D(e),n=!!e.is_bookmarked;return`
                        <div class="feed-bundle-member" data-event-id="${r(e.id)}" style="display:flex; align-items:center; gap:10px; padding:8px 0; border-top:1px dashed rgba(0,45,91,0.06);">
                            <div style="flex:1; min-width:0; font-size:0.88rem; color:var(--text-secondary); line-height:1.4;">${t}</div>
                            <button type="button" class="icon-btn-circle feed-bookmark-btn" style="--accent: ${n?x.bookmark:x.muted};" data-event-id="${r(e.id)}" data-bookmarked="${n?`1`:`0`}" title="${n?`Remove bookmark`:`Bookmark`}" aria-label="${n?`Remove bookmark`:`Bookmark`}">
                                ${k(`bookmark`,n)}
                            </button>
                        </div>
                    `}).join(``);return`
                    <div class="card glass feed-event feed-bundle" data-bundle-id="${r(t.id)}"
                        style="padding: 16px 18px; border-radius: 18px; background: white; border: 1px solid ${n.color}22; border-left: 4px solid ${n.color}; box-shadow: 0 4px 14px rgba(0,45,91,0.06); display:flex; flex-direction:column; gap:0;">
                        <div style="display:flex; align-items:flex-start; gap:14px;">
                            ${T(t.actor)}
                            <div style="flex:1; min-width:0;">
                                <div style="font-size: 0.95rem; line-height:1.4; color: var(--text-secondary);">
                                    <span style="margin-right:6px;">${n.icon}</span>${w(t)}
                                </div>
                                ${i?`<div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;">${r(i)}</div>`:``}
                            </div>
                            <button type="button" class="feed-bundle-toggle" data-bundle-id="${r(t.id)}"
                                style="background:transparent; border:0; color:#005bb8; cursor:pointer; padding:4px 10px; font-size:0.78rem; font-weight:800; flex-shrink:0;">${a?`Collapse`:`View all`}</button>
                        </div>
                        <div class="feed-bundle-members" style="margin-top: ${a?`8px`:`0`}; padding-top: ${a?`4px`:`0`}; display: ${a?`block`:`none`};">
                            ${o}
                        </div>
                    </div>
                `}let t=e,n=O(t.type),i=E(t.when),a=t.caption?`
                <div style="margin-top:10px; padding:10px 12px; background:rgba(88,86,214,0.06); border-radius:12px; font-size:0.92rem; color:#002d5b; line-height:1.45; white-space:pre-wrap; word-wrap:break-word;">${r(t.caption)}</div>
            `:``,o=(t.type===`friend_shared_trip`||t.type===`friend_reposted_trip`)&&t.trip?.id?(()=>{let e=t.trip.country?r(t.trip.country):``;return`
                    <button type="button" class="feed-trip-card" data-trip-id="${r(t.trip.id)}"
                        style="margin-top:10px; width:100%; text-align:left; background:white; border:1px solid rgba(88,86,214,0.22); border-left:4px solid #5856d6; border-radius:14px; padding:12px 14px; cursor:pointer; display:flex; align-items:center; gap:12px; box-shadow:0 2px 8px rgba(0,45,91,0.04); transition: transform 0.15s ease, box-shadow 0.15s ease;">
                        <span style="font-size:1.6rem; line-height:1; flex-shrink:0;">🗺️</span>
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight:800; color:#002d5b; font-size:0.98rem; line-height:1.25; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${r(t.trip.name||`Trip`)}</div>
                            ${e?`<div style="font-size:0.78rem; color:var(--text-secondary); font-weight:600; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📍 ${e}</div>`:``}
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="color:#5856d6; flex-shrink:0;"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                `})():``,c=t.type===`friend_shared_trip`&&t.actor?.id===s&&t.post_id?`
                <button type="button" class="feed-unshare-btn" data-post-id="${t.post_id}" title="Unshare — removes from your friends' feeds" aria-label="Unshare"
                    style="background:transparent; border:0; color:rgba(255,59,48,0.55); cursor:pointer; padding:2px 6px; font-size:0.85rem; font-weight:800; flex-shrink:0; line-height:1;">✕</button>
            `:``;return`
                <div class="card glass feed-event" data-event-id="${r(t.id)}"
                    style="padding: 16px 18px; border-radius: 18px; background: white; border: 1px solid ${n.color}22; border-left: 4px solid ${n.color}; box-shadow: 0 4px 14px rgba(0,45,91,0.06); display:flex; flex-direction:column; gap:0;">
                    <div style="display:flex; align-items:flex-start; gap:14px;">
                        ${T(t.actor)}
                        <div style="flex:1; min-width:0;">
                            <div style="font-size: 0.95rem; line-height:1.4; color: var(--text-secondary);">
                                <span style="margin-right:6px;">${n.icon}</span>${D(t)}
                            </div>
                            ${i?`<div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;">${r(i)}</div>`:``}
                        </div>
                        ${c}
                    </div>
                    ${a}
                    ${o}
                    ${j(t)}
                </div>
            `}).join(``)},_=async()=>{if(f.user)try{let e=await m(`/api/feed`);if(!e.ok)return;let n=await e.json();Array.isArray(n)&&(P=n,t())}catch(e){console.error(`Feed refresh failed:`,e)}};e.querySelectorAll(`.home-tabnav__tab[data-feed-tab]`).forEach(n=>{n.onclick=()=>{let r=n.dataset.feedTab;!r||I===r||(I=r,e.querySelectorAll(`.home-tabnav__tab[data-feed-tab]`).forEach(e=>{e.classList.toggle(`is-active`,e.dataset.feedTab===r)}),t())}});let v=e.querySelector(`#feedBookmarkToggle .apple-toggle__input`);return v&&v.addEventListener(`change`,()=>{L=!!v.checked,t()}),e.addEventListener(`click`,async e=>{let n=e.target;if(!n)return;let r=n.closest(`.feed-avatar-btn`);if(r?.dataset.feedAvatarUserId){l(`profile`,{userId:r.dataset.feedAvatarUserId});return}let f=n.closest(`.feed-trip-card`);if(f?.dataset.tripId){g(f.dataset.tripId);return}let p=n.closest(`.feed-like-btn`);if(p?.dataset.eventId){let e=p.dataset.eventId,t=p.dataset.liked===`1`,n=!t,r=P.find(t=>t.id===e);r&&(r.is_liked=n,r.like_count=Math.max(0,(r.like_count||0)+(t?-1:1))),p.dataset.liked=n?`1`:`0`,p.style.setProperty(`--accent`,n?x.like:x.muted),p.innerHTML=k(`heart`,n);let i=p.parentElement?.querySelector(`.feed-action-count`),a=e=>e>=3?String(e):``;i&&r&&(i.textContent=a(r.like_count??0));let o=await h(e);o.ok&&o.body&&r&&(r.is_liked=!!o.body.liked,r.like_count=Number(o.body.count)||0,i&&(i.textContent=a(r.like_count)));return}let m=n.closest(`.feed-bookmark-btn`);if(m?.dataset.eventId){let e=m.dataset.eventId,n=m.dataset.bookmarked!==`1`,r=P.find(t=>t.id===e);r&&(r.is_bookmarked=n),m.dataset.bookmarked=n?`1`:`0`,m.style.setProperty(`--accent`,n?x.bookmark:x.muted),m.innerHTML=k(`bookmark`,n),L&&!n&&t(),await d(e);return}let v=n.closest(`.feed-bundle-toggle`);if(v?.dataset.bundleId){let e=v.dataset.bundleId;N.has(e)?N.delete(e):N.add(e),t();return}let y=n.closest(`.feed-comment-btn`);if(y?.dataset.eventId){let e=y.dataset.eventId,t=y.closest(`.feed-event`)?.querySelector(`.feed-thread`);if(!t)return;if(t.style.display!==`none`){t.style.display=`none`;return}t.style.display=`block`,F[e]?R(t,e,F[e]):(t.innerHTML=`<div style="font-size:0.82rem; color:var(--text-secondary); padding:6px 0;">Loading…</div>`,F[e]=await o(e)||[],R(t,e,F[e]));let n=t.querySelector(`input[name="body"]`);n&&n.focus();return}let b=n.closest(`.feed-comment-delete-btn`);if(b?.dataset.commentId){let e=Number(b.dataset.commentId),t=b.closest(`.feed-comment-row`),n=b.closest(`.feed-thread`),r=n?.dataset.eventId;t&&t.remove(),r&&F[r]&&(F[r]=F[r].filter(t=>t.id!==e));let i=r?P.find(e=>e.id===r):null;if(i){i.comment_count=Math.max(0,(i.comment_count||0)-1);let e=((n?.closest(`.feed-event`))?.querySelector(`.feed-comment-btn`))?.parentElement?.querySelector(`.feed-action-count`);e&&(e.textContent=i.comment_count>0?String(i.comment_count):``)}(await u(e)).ok||a(`Couldn't delete — try again in a moment.`);return}let S=n.closest(`.feed-unshare-btn`);if(S?.dataset.postId){let e=Number(S.dataset.postId);i({title:`Unshare this trip?`,message:`It'll disappear from your friends' feeds. Any reposts of it will be removed too. This can't be undone.`,confirmText:`Unshare`,onConfirm:async()=>{let t=await c(e);if(!t||!t.ok){a(`Couldn't unshare — try again in a moment.`);return}await _(),a(`Removed from your feed.`)}});return}let C=n.closest(`.feed-repost-btn`);if(C?.dataset.postId){let e=Number(C.dataset.postId),t=C.style.getPropertyValue(`--accent`)||x.muted;C.disabled=!0,C.style.setProperty(`--accent`,x.muted);let n=await s(e);n.ok&&n.body?.status!==`same_user`?(a(n.body?.status===`already_reposted`?`Already reposted`:`Reposted to your feed`),C.style.setProperty(`--accent`,x.repost),C.innerHTML=`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`):n.body?.status===`same_user`?(C.disabled=!1,C.style.setProperty(`--accent`,t),a(`That's your own share — no need to repost it.`)):(C.disabled=!1,C.style.setProperty(`--accent`,t),a(`Repost failed — try again in a moment.`));return}}),e.addEventListener(`submit`,async e=>{let t=e.target;if(!t?.classList?.contains(`feed-comment-form`))return;e.preventDefault();let n=t.dataset.eventId;if(!n)return;let r=t.querySelector(`input[name="body"]`),i=r?.value.trim();if(!i)return;let o=t.querySelector(`.feed-comment-submit`);r&&(r.value=``),o&&(o.disabled=!0);let s=await p(n,i);if(o&&(o.disabled=!1),!s.ok||!s.body?.comment){r&&(r.value=i),a(`Couldn't post comment — try again.`);return}let c=s.body.comment;F[n]||(F[n]=[]),F[n].push(c);let l=t.closest(`.feed-thread`);l&&R(l,n,F[n]);let u=l?.querySelector(`input[name="body"]`);u&&u.focus();let d=P.find(e=>e.id===n);if(d){d.comment_count=(d.comment_count||0)+1;let e=((l?.closest(`.feed-event`))?.querySelector(`.feed-comment-btn`))?.parentElement?.querySelector(`.feed-action-count`);e&&(e.textContent=String(d.comment_count))}}),t(),_(),e}var B=t();function V(){let e=(0,v.useRef)(null);return(0,v.useEffect)(()=>{let t=e.current;t&&(t.innerHTML=``,t.appendChild(z()))},[]),(0,B.jsx)(`div`,{ref:e})}function H(e){_(e,(0,v.createElement)(V))}export{H as mountFeed};
//# sourceMappingURL=mount-Bt1qAExH.js.map