import{r as e,t}from"./vendor-react-CAxw18f3.js";import{B as n,Ct as r,D as i,E as a,M as o,O as s,P as c,Pt as l,St as u,U as d,Y as f,b as p,et as m,gt as h,v as g,vt as _,yt as v,z as y}from"../app.bundle.js";import{t as b}from"./collections-BjfdXY8Q.js";var x=e(),S=new Set([`friend_shared_trip`,`friend_reposted_trip`]),C=new Set([`friend_created_trip`,`friend_archived_trip`,`friend_joined_trip`,`new_friendship`]),w={muted:`142,142,147`,like:`255,59,48`,comment:`0,113,227`,repost:`52,199,89`,bookmark:`255,149,0`};function T(e){if(!e)return``;let t=typeof e==`string`&&e.includes(` `)&&!e.includes(`T`)?e.replace(` `,`T`)+`Z`:e,n=new Date(t);return Number.isNaN(n.getTime())?``:n.toISOString().slice(0,10)}function E(e){let t=new Map,n=[];for(let r of e){if(S.has(r.type)){n.push(r);continue}let e=`${r.actor?.id||`anon`}|${r.type}|${T(r.when)}`,i=t.get(e);i||(i=[],t.set(e,i),n.push({__slot:e})),i.push(r)}return n.map(e=>{let n=e.__slot;if(!n)return e;let r=t.get(n)||[];if(r.length===1)return r[0];let i=r[0];return{bundled:!0,id:`bundle_${n}`,type:i.type,actor:i.actor,when:i.when,members:r}})}function D(e){let t=`<strong style="color:#002d5b;">${v(e.actor.name)}</strong>`,n=e.members.length,r=n===1?`trip`:`trips`;switch(e.type){case`friend_created_trip`:return`${t} started planning <strong style="color:#002d5b;">${n} new ${r}</strong>`;case`friend_archived_trip`:return`${t} just completed <strong style="color:#002d5b;">${n} ${r}</strong> 🎉`;case`friend_joined_trip`:return`${t} joined <strong style="color:#002d5b;">${n} ${r}</strong>`;case`new_friendship`:return`You and <strong style="color:#002d5b;">${n} new people</strong> are now friends 🤝`;default:return`${t} did ${n} new things`}}function O(e,t=44){let n=(e?.name||`?`).charAt(0).toUpperCase(),r=`<div style="width:${t}px; height:${t}px; border-radius:50%; background: var(--gradient-day); color:white; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:${Math.round(t*.4)}px; flex-shrink:0; box-shadow: 0 2px 8px rgba(0,113,227,0.18);">${v(n)}</div>`,i=e?.picture?`<img src="${v(e.picture)}" alt="" referrerpolicy="no-referrer"
            onerror="this.outerHTML=this.dataset.fallback;"
            data-fallback="${v(r)}"
            style="width:${t}px; height:${t}px; border-radius:50%; object-fit:cover; flex-shrink:0; border:2px solid rgba(255,255,255,0.6); box-shadow: 0 2px 8px rgba(0,45,91,0.12);">`:r;return e?.id?`<button type="button" class="feed-avatar-btn" data-feed-avatar-user-id="${v(e.id)}"
        title="View ${v(e.name||`profile`)}"
        aria-label="View ${v(e.name||`profile`)}'s profile"
        style="background:transparent; border:0; padding:0; margin:0; cursor:pointer; line-height:0; flex-shrink:0; border-radius:50%;">${i}</button>`:i}function k(e){if(!e)return``;let t=typeof e==`string`&&e.includes(` `)&&!e.includes(`T`)?e.replace(` `,`T`)+`Z`:e,n=new Date(t).getTime();if(Number.isNaN(n))return``;let r=Date.now()-n,i=Math.floor(r/1e3);if(i<60)return`just now`;let a=Math.floor(i/60);if(a<60)return`${a}m ago`;let o=Math.floor(a/60);if(o<24)return`${o}h ago`;let s=Math.floor(o/24);return s<7?`${s}d ago`:new Date(n).toLocaleDateString(`en-US`,{month:`short`,day:`numeric`})}function A(e){let t=l.user?.id,n=t&&e.actor?.id===t?`<strong style="color:#002d5b;">You</strong>`:`<strong style="color:#002d5b;">${v(e.actor.name)}</strong>`,r=e.trip?`<strong style="color:#002d5b;">${v(e.trip.name||e.trip.country||`a trip`)}</strong>`:``;switch(e.type){case`friend_created_trip`:return`${n} started planning a new trip — ${r}${e.trip?.country?` (${v(e.trip.country)})`:``}`;case`friend_archived_trip`:return`${n} just completed their trip to <strong style="color:#002d5b;">${v(e.trip?.country||e.trip?.name||`somewhere`)}</strong> 🎉`;case`friend_joined_trip`:return`${n} joined the trip ${r}`;case`new_friendship`:return`You and ${n} are now friends 🤝`;case`friend_shared_trip`:return`${n} shared a trip — ${r}${e.trip?.country?` (${v(e.trip.country)})`:``}`;case`friend_reposted_trip`:{let i=!!t&&e.original_sharer?.id===t;return`${n} reposted ${e.original_sharer?i?`<strong style="color:#002d5b;">your</strong> share`:`<strong style="color:#002d5b;">${v(e.original_sharer.name)}</strong>'s trip`:`someone`} — ${r}${e.trip?.country?` (${v(e.trip.country)})`:``}`}default:return`${n} did something new`}}function j(e){switch(e){case`friend_created_trip`:return{color:`#0071e3`,icon:`🗺️`};case`friend_archived_trip`:return{color:`#34c759`,icon:`🏁`};case`friend_joined_trip`:return{color:`#ff9500`,icon:`👥`};case`new_friendship`:return{color:`#9b59b6`,icon:`🤝`};case`friend_shared_trip`:return{color:`#5856d6`,icon:`📣`};case`friend_reposted_trip`:return{color:`#5856d6`,icon:`🔁`};default:return{color:`#8e8e93`,icon:`✨`}}}function M(e,t=!1){let n=t?` fill="currentColor"`:``,r=``;switch(e){case`heart`:r=`<path${n} d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>`;break;case`comment`:r=`<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>`;break;case`repost`:r=`<polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path>`;break;case`bookmark`:r=`<path${n} d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>`;break}return`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`+r+`</svg>`}function N(e){let t=`display:inline-flex; align-items:center; gap:6px;${e.marginLeftAuto?` margin-left:auto;`:``}`,n=e.countThreshold??1,r=typeof e.count==`number`,i=r&&e.count>=n?String(e.count):``;return`
        <span style="${t}">
            <button type="button" class="icon-btn-circle ${e.className}" style="--accent: ${e.accent};" ${e.dataAttrs||``} title="${e.title}" aria-label="${e.title}">
                ${e.svg}
            </button>
            ${r?`<span class="feed-action-count" data-threshold="${n}" style="font-size:0.78rem; color:var(--text-secondary); font-weight:700; min-width:0.8em;">${i}</span>`:``}
        </span>
    `}function P(e){let t=S.has(e.type),n=!!e.is_bookmarked,r=N({className:`feed-bookmark-btn`,accent:n?w.bookmark:w.muted,dataAttrs:`data-event-id="${v(e.id)}" data-bookmarked="${n?`1`:`0`}"`,title:n?`Remove bookmark`:`Bookmark`,svg:M(`bookmark`,n),marginLeftAuto:!0});if(!t)return`
            <div class="feed-actions" style="display:flex; align-items:center; gap:10px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(0,45,91,0.06);">
                ${r}
            </div>
        `;let i=!!e.is_liked,a=e.like_count||0,o=e.comment_count||0,s=!!e.post_id;return`
        <div class="feed-actions" style="display:flex; align-items:center; gap:10px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(0,45,91,0.06);">
            ${N({className:`feed-like-btn`,accent:i?w.like:w.muted,dataAttrs:`data-event-id="${v(e.id)}" data-liked="${i?`1`:`0`}"`,title:i?`Unlike`:`Like`,svg:M(`heart`,i),count:a,countThreshold:3})}
            ${N({className:`feed-comment-btn`,accent:w.comment,dataAttrs:`data-event-id="${v(e.id)}"`,title:`Comments`,svg:M(`comment`),count:o})}
            ${s?N({className:`feed-repost-btn`,accent:w.muted,dataAttrs:`data-post-id="${e.post_id}"`,title:`Repost to your friends`,svg:M(`repost`)}):``}
            ${r}
        </div>
        <div class="feed-thread" data-event-id="${v(e.id)}" data-loaded="0" style="display:none; margin-top:10px; padding-top:10px; border-top:1px solid rgba(0,45,91,0.06);"></div>
    `}function F(e,t){return`
        <div class="feed-comment-row" data-comment-id="${e.id}" style="display:flex; align-items:flex-start; gap:10px; padding:8px 0; border-bottom:1px dashed rgba(0,45,91,0.06);">
            ${O(e.author,32)}
            <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
                    <strong style="color:#002d5b; font-size:0.85rem;">${v(e.author?.name||`Someone`)}</strong>
                    <span style="font-size:0.7rem; color:var(--text-secondary); font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">${v(k(e.when))}</span>
                </div>
                <div style="font-size:0.88rem; color:#002d5b; line-height:1.4; margin-top:2px; white-space:pre-wrap; word-wrap:break-word;">${v(e.body||``)}</div>
            </div>
            ${t?`
                <button type="button" class="feed-comment-delete-btn" data-comment-id="${e.id}" title="Delete your comment" aria-label="Delete comment"
                    style="background:transparent; border:0; color:rgba(255,59,48,0.6); cursor:pointer; padding:2px 6px; font-size:0.72rem; font-weight:800; flex-shrink:0;">✕</button>`:``}
        </div>
    `}var I=new Set;function L(e){e.classList.remove(`tap-pop`),e.offsetWidth,e.classList.add(`tap-pop`),e.addEventListener(`animationend`,()=>{e.classList.remove(`tap-pop`)},{once:!0})}var R=[],z={},B=`posts`,V=!1,H=null,U=null;function W(e){return H!==null&&U===null?(e(),Promise.resolve()):U?U.then(e):(U=(async()=>{try{let e=await i();e.error?(console.warn(`explore fetch failed:`,e.error),H=[]):H=e.items||[]}finally{U=null,e()}})(),U)}function G(e,t,n){let r=l.user?.id;e.innerHTML=`
        <div class="feed-comment-list">${n.length>0?n.map(e=>F(e,e.author?.id===r)).join(``):`<div style="font-size:0.82rem; color:var(--text-secondary); padding:6px 0;">${g(`feed.commentsEmpty`)}</div>`}</div>
        <form class="feed-comment-form" data-event-id="${v(t)}" style="display:flex; gap:8px; margin-top:10px;">
            <input type="text" name="body" placeholder="Add a comment…" maxlength="500" autocomplete="off"
                style="flex:1; min-width:0; padding:8px 12px; border:1px solid rgba(0,45,91,0.12); border-radius:999px; font-size:0.85rem; background:rgba(0,113,227,0.04); color:#002d5b; font-family: inherit;">
            <button type="submit" class="feed-comment-submit" title="Post comment" aria-label="Post comment"
                style="background:var(--accent-blue); color:white; border:0; padding:8px 16px; border-radius:999px; font-size:0.82rem; font-weight:800; cursor:pointer;">${g(`feed.commentSubmit`)}</button>
        </form>
    `}function K(){let e=document.createElement(`div`);e.style.cssText=`font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',sans-serif;`,e.innerHTML=`
        <div style="max-width: 760px; margin: 0 auto;">
            <div style="padding:32px 0 24px; text-align:center;">
                <h1 style="margin:0 0 6px;font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;background:var(--gradient-title);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">${g(`feed.title`)}</h1>
                <p style="margin:0;color:var(--text-secondary);font-size:1rem;">${g(`feed.subtitle`)}</p>
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
                    <button class="home-tabnav__tab${B===`posts`?` is-active`:``}" data-feed-tab="posts" role="tab" type="button" style="--accent: 88, 86, 214;">${g(`feed.tabPosts`)}</button>
                    <button class="home-tabnav__tab${B===`actions`?` is-active`:``}" data-feed-tab="actions" role="tab" type="button" style="--accent: 255, 149, 0;">${g(`feed.tabActions`)}</button>
                    <!-- §4.2 — Explore tab. Accent is the share/cover
                         teal so it visually reads as "outward / discovery"
                         vs the social-purple Posts and orange Actions. -->
                    <button class="home-tabnav__tab${B===`explore`?` is-active`:``}" data-feed-tab="explore" role="tab" type="button" style="--accent: 0, 199, 190;">Explore</button>
                </nav>
                <label class="apple-toggle feed-tabs-row__bookmark" id="feedBookmarkToggle" title="Filter to bookmarked items only">
                    <input type="checkbox" class="apple-toggle__input" ${V?`checked`:``}>
                    <span class="apple-toggle__track"><span class="apple-toggle__thumb"></span></span>
                    <span class="apple-toggle__label">${g(`feed.bookmarkToggleLabel`)}</span>
                </label>
            </div>

            <div id="feedList" style="display:flex; flex-direction:column; gap:12px;"></div>
        </div>
    `;let t=!1,i=e=>{let t=e.coverUrl?`background-image: url('${v(e.coverUrl)}'); background-size: cover; background-position: center;`:`background: linear-gradient(135deg, #00c7be 0%, #007aff 100%);`,n=e.owner.picture?`<img src="${v(e.owner.picture)}" alt="" referrerpolicy="no-referrer" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">`:`<div style="width:24px; height:24px; border-radius:50%; background:rgba(0,113,227,0.18); display:flex; align-items:center; justify-content:center; color:#005bb8; font-size:0.7rem; font-weight:800;">${v((e.owner.firstName||`?`).slice(0,1).toUpperCase())}</div>`;return`
            <a class="card glass feed-explore-card" href="/share/${v(e.shareToken)}"
               style="display:block; text-decoration:none; color:inherit; padding:0; border-radius:18px; overflow:hidden; box-shadow:0 4px 14px rgba(0,45,91,0.06); border:1px solid rgba(0,199,190,0.18);">
                <div style="${t} height: 160px; position: relative;">
                    <div style="position:absolute; right:10px; top:10px; background:rgba(0,0,0,0.55); color:white; padding:4px 10px; border-radius:999px; font-size:0.72rem; font-weight:700; backdrop-filter: blur(8px);">
                        👁 ${v(String(e.shareViews))}
                    </div>
                </div>
                <div style="padding: 14px 16px;">
                    <div style="font-size:1.05rem; font-weight:800; color:var(--text-primary); letter-spacing:-0.02em; margin-bottom:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${v(e.name)}</div>
                    <div style="font-size:0.82rem; color:var(--text-secondary); font-weight:600; margin-bottom:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${v(e.country)}</div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        ${n}
                        <span style="font-size:0.8rem; color:var(--text-secondary); font-weight:600;">by ${v(e.owner.firstName||`Traveller`)}</span>
                    </div>
                </div>
            </a>
        `},m=()=>{let n=u(e,`#feedList`);if(!n)return;if(B===`explore`){if(H===null){n.innerHTML=`
                    <div class="card glass" style="padding: 32px; border-radius: 24px; text-align:center;">
                        <div class="spinner-ring" style="width:32px; height:32px; border:3px solid rgba(0,199,190,0.18); border-top-color:#00a39d; border-radius:50%; animation:spin 1s linear infinite; margin: 0 auto 14px;"></div>
                        <div style="color: var(--text-secondary); font-size: 0.88rem; font-weight: 600;">Finding trips to discover…</div>
                    </div>
                `;return}if(H.length===0){n.innerHTML=_({accent:`blue`,emoji:`🌍`,title:`No public trips yet`,body:`Be the first — share one of your own to seed the Explore feed for everyone.`});return}n.innerHTML=`
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:14px;">
                    ${H.map(i).join(``)}
                </div>
            `;return}if(!t&&R.length===0){n.innerHTML=`
                <div class="card glass" style="padding: 32px; border-radius: 24px; text-align:center;">
                    <div class="spinner-ring" style="width:32px; height:32px; border:3px solid rgba(155,89,182,0.18); border-top-color:#7c3a9e; border-radius:50%; animation:spin 1s linear infinite; margin: 0 auto 14px;"></div>
                    <div style="color: var(--text-secondary); font-size: 0.88rem; font-weight: 600;">${g(`feed.loading`)}</div>
                </div>
            `;return}let r=e=>B===`posts`?S.has(e.type):C.has(e.type),a=R.filter(e=>!(!r(e)||V&&!e.is_bookmarked));if(a.length===0){let t,r,i,a;V?(t=g(B===`posts`?`feed.emptyBookmarkedPostsTitle`:`feed.emptyBookmarkedActionsTitle`),r=g(`feed.emptyBookmarkedBody`),i=g(`feed.emptyBookmarkedCta`),a=()=>{V=!1;let t=e.querySelector(`#feedBookmarkToggle .apple-toggle__input`);t&&(t.checked=!1),m()}):B===`posts`?(t=g(`feed.emptyPostsTitle`),r=g(`feed.emptyPostsBody`),i=g(`feed.emptyPostsCta`),a=()=>{B=`actions`,m(),e.querySelectorAll(`.home-tabnav__tab`).forEach(e=>e.classList.toggle(`is-active`,e.dataset.feedTab===`actions`))}):(t=g(`feed.emptyActionsTitle`),r=g(`feed.emptyActionsBody`),i=g(`feed.emptyActionsCta`),a=()=>f(`friends`)),n.innerHTML=_({accent:`purple`,emoji:V?`🔖`:`🌱`,title:t,body:r,ctaLabel:i,ctaId:`feedEmptyCtaBtn`});let o=n.querySelector(`#feedEmptyCtaBtn`);o&&(o.onclick=a);return}let o=l.user?.id;n.innerHTML=E(a).map(e=>{if(e.bundled){let t=e,n=j(t.type),r=k(t.when),i=I.has(t.id),a=t.members.map(e=>{let t=A(e),n=!!e.is_bookmarked;return`
                        <div class="feed-bundle-member" data-event-id="${v(e.id)}" style="display:flex; align-items:center; gap:10px; padding:8px 0; border-top:1px dashed rgba(0,45,91,0.06);">
                            <div style="flex:1; min-width:0; font-size:0.88rem; color:var(--text-secondary); line-height:1.4;">${t}</div>
                            <button type="button" class="icon-btn-circle feed-bookmark-btn" style="--accent: ${n?w.bookmark:w.muted};" data-event-id="${v(e.id)}" data-bookmarked="${n?`1`:`0`}" title="${n?`Remove bookmark`:`Bookmark`}" aria-label="${n?`Remove bookmark`:`Bookmark`}">
                                ${M(`bookmark`,n)}
                            </button>
                        </div>
                    `}).join(``);return`
                    <div class="card glass feed-event feed-bundle" data-bundle-id="${v(t.id)}"
                        style="padding: 16px 18px; border-radius: 18px; background: white; border: 1px solid ${n.color}22; border-left: 4px solid ${n.color}; box-shadow: 0 4px 14px rgba(0,45,91,0.06); display:flex; flex-direction:column; gap:0;">
                        <div style="display:flex; align-items:flex-start; gap:14px;">
                            ${O(t.actor)}
                            <div style="flex:1; min-width:0;">
                                <div style="font-size: 0.95rem; line-height:1.4; color: var(--text-secondary);">
                                    <span style="margin-right:6px;">${n.icon}</span>${D(t)}
                                </div>
                                ${r?`<div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;">${v(r)}</div>`:``}
                            </div>
                            <button type="button" class="feed-bundle-toggle" data-bundle-id="${v(t.id)}"
                                style="background:transparent; border:0; color:#005bb8; cursor:pointer; padding:4px 10px; font-size:0.78rem; font-weight:800; flex-shrink:0;">${g(i?`feed.bundleCollapse`:`feed.bundleViewAll`)}</button>
                        </div>
                        <div class="feed-bundle-members" style="margin-top: ${i?`8px`:`0`}; padding-top: ${i?`4px`:`0`}; display: ${i?`block`:`none`};">
                            ${a}
                        </div>
                    </div>
                `}let t=e,n=j(t.type),r=k(t.when),i=t.caption?`
                <div style="margin-top:10px; padding:10px 12px; background:rgba(88,86,214,0.06); border-radius:12px; font-size:0.92rem; color:#002d5b; line-height:1.45; white-space:pre-wrap; word-wrap:break-word;">${v(t.caption)}</div>
            `:``,a=(t.type===`friend_shared_trip`||t.type===`friend_reposted_trip`)&&t.trip?.id?(()=>{let e=t.trip.country?v(t.trip.country):``;return`
                    <button type="button" class="feed-trip-card" data-trip-id="${v(t.trip.id)}"
                        style="margin-top:10px; width:100%; text-align:left; background:white; border:1px solid rgba(88,86,214,0.22); border-left:4px solid #5856d6; border-radius:14px; padding:12px 14px; cursor:pointer; display:flex; align-items:center; gap:12px; box-shadow:0 2px 8px rgba(0,45,91,0.04); transition: transform 0.15s ease, box-shadow 0.15s ease;">
                        <span style="font-size:1.6rem; line-height:1; flex-shrink:0;">🗺️</span>
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight:800; color:#002d5b; font-size:0.98rem; line-height:1.25; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${v(t.trip.name||g(`feed.tripFallback`))}</div>
                            ${e?`<div style="font-size:0.78rem; color:var(--text-secondary); font-weight:600; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📍 ${e}</div>`:``}
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="color:#5856d6; flex-shrink:0;"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                `})():``,s=t.type===`friend_shared_trip`&&t.actor?.id===o&&t.post_id?`
                <button type="button" class="feed-unshare-btn" data-post-id="${t.post_id}" title="Unshare — removes from your friends' feeds" aria-label="Unshare"
                    style="background:transparent; border:0; color:rgba(255,59,48,0.55); cursor:pointer; padding:2px 6px; font-size:0.85rem; font-weight:800; flex-shrink:0; line-height:1;">✕</button>
            `:``;return`
                <div class="card glass feed-event" data-event-id="${v(t.id)}"
                    style="padding: 16px 18px; border-radius: 18px; background: white; border: 1px solid ${n.color}22; border-left: 4px solid ${n.color}; box-shadow: 0 4px 14px rgba(0,45,91,0.06); display:flex; flex-direction:column; gap:0;">
                    <div style="display:flex; align-items:flex-start; gap:14px;">
                        ${O(t.actor)}
                        <div style="flex:1; min-width:0;">
                            <div style="font-size: 0.95rem; line-height:1.4; color: var(--text-secondary);">
                                <span style="margin-right:6px;">${n.icon}</span>${A(t)}
                            </div>
                            ${r?`<div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;">${v(r)}</div>`:``}
                        </div>
                        ${s}
                    </div>
                    ${i}
                    ${a}
                    ${P(t)}
                </div>
            `}).join(``)},x=async()=>{if(!l.user){t=!0,m();return}try{let e=await p(`/api/feed`);if(!e.ok)return;let t=await e.json();Array.isArray(t)&&(R=t)}catch(e){console.error(`Feed refresh failed:`,e)}finally{t=!0,m()}};e.querySelectorAll(`.home-tabnav__tab[data-feed-tab]`).forEach(t=>{t.onclick=()=>{let n=t.dataset.feedTab;!n||B===n||(B=n,e.querySelectorAll(`.home-tabnav__tab[data-feed-tab]`).forEach(e=>{e.classList.toggle(`is-active`,e.dataset.feedTab===n)}),n===`explore`&&W(m),m())}});let T=e.querySelector(`#feedBookmarkToggle .apple-toggle__input`);return T&&T.addEventListener(`change`,()=>{V=!!T.checked,m()}),e.addEventListener(`click`,async e=>{let t=e.target;if(!t)return;let i=t.closest(`.feed-avatar-btn`);if(i?.dataset.feedAvatarUserId){f(`profile`,{userId:i.dataset.feedAvatarUserId});return}let o=t.closest(`.feed-trip-card`);if(o?.dataset.tripId){b(o.dataset.tripId);return}let l=t.closest(`.feed-like-btn`);if(l?.dataset.eventId){let e=l.dataset.eventId,t=l.dataset.liked===`1`,r=!t,i=R.find(t=>t.id===e);i&&(i.is_liked=r,i.like_count=Math.max(0,(i.like_count||0)+(t?-1:1))),l.dataset.liked=r?`1`:`0`,l.style.setProperty(`--accent`,r?w.like:w.muted),l.innerHTML=M(`heart`,r),L(l);let a=l.parentElement?.querySelector(`.feed-action-count`),o=e=>e>=3?String(e):``;a&&i&&(a.textContent=o(i.like_count??0));let s=await n(e);s.ok&&s.body&&i&&(i.is_liked=!!s.body.liked,i.like_count=Number(s.body.count)||0,a&&(a.textContent=o(i.like_count)));return}let u=t.closest(`.feed-bookmark-btn`);if(u?.dataset.eventId){let e=u.dataset.eventId,t=u.dataset.bookmarked!==`1`,n=R.find(t=>t.id===e);n&&(n.is_bookmarked=t),u.dataset.bookmarked=t?`1`:`0`,u.style.setProperty(`--accent`,t?w.bookmark:w.muted),u.innerHTML=M(`bookmark`,t),L(u),V&&!t&&m(),await y(e);return}let p=t.closest(`.feed-bundle-toggle`);if(p?.dataset.bundleId){let e=p.dataset.bundleId;I.has(e)?I.delete(e):I.add(e),m();return}let _=t.closest(`.feed-comment-btn`);if(_?.dataset.eventId){let e=_.dataset.eventId,t=_.closest(`.feed-event`)?.querySelector(`.feed-thread`);if(!t)return;if(t.style.display!==`none`){t.style.display=`none`;return}t.style.display=`block`,z[e]?G(t,e,z[e]):(t.innerHTML=`<div style="font-size:0.82rem; color:var(--text-secondary); padding:6px 0;">${g(`feed.commentsLoading`)}</div>`,z[e]=await s(e)||[],G(t,e,z[e]));let n=t.querySelector(`input[name="body"]`);n&&n.focus();return}let v=t.closest(`.feed-comment-delete-btn`);if(v?.dataset.commentId){let e=Number(v.dataset.commentId),t=v.closest(`.feed-comment-row`),n=v.closest(`.feed-thread`),i=n?.dataset.eventId;t&&t.remove(),i&&z[i]&&(z[i]=z[i].filter(t=>t.id!==e));let o=i?R.find(e=>e.id===i):null;if(o){o.comment_count=Math.max(0,(o.comment_count||0)-1);let e=((n?.closest(`.feed-event`))?.querySelector(`.feed-comment-btn`))?.parentElement?.querySelector(`.feed-action-count`);e&&(e.textContent=o.comment_count>0?String(o.comment_count):``)}(await a(e)).ok||r(`Couldn't delete — try again in a moment.`);return}let S=t.closest(`.feed-unshare-btn`);if(S?.dataset.postId){let e=Number(S.dataset.postId);h({title:g(`feed.toastUnshareConfirmTitle`),message:g(`feed.toastUnshareConfirmMessage`),confirmText:g(`feed.toastUnshareConfirmBtn`),onConfirm:async()=>{let t=await d(e);if(!t||!t.ok){r(g(`feed.toastUnshareFailed`));return}await x(),r(g(`feed.toastRemovedFromFeed`))}});return}let C=t.closest(`.feed-repost-btn`);if(C?.dataset.postId){let e=Number(C.dataset.postId),t=C.style.getPropertyValue(`--accent`)||w.muted;C.disabled=!0,C.style.setProperty(`--accent`,w.muted);let n=await c(e);n.ok&&n.body?.status!==`same_user`?(r(n.body?.status===`already_reposted`?g(`feed.toastAlreadyReposted`):g(`feed.toastReposted`)),C.style.setProperty(`--accent`,w.repost),C.innerHTML=`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`,L(C)):n.body?.status===`same_user`?(C.disabled=!1,C.style.setProperty(`--accent`,t),r(g(`feed.toastRepostOwnShare`))):(C.disabled=!1,C.style.setProperty(`--accent`,t),r(g(`feed.toastRepostFailed`)));return}}),e.addEventListener(`submit`,async e=>{let t=e.target;if(!t?.classList?.contains(`feed-comment-form`))return;e.preventDefault();let n=t.dataset.eventId;if(!n)return;let i=t.querySelector(`input[name="body"]`),a=i?.value.trim();if(!a)return;let s=t.querySelector(`.feed-comment-submit`);i&&(i.value=``),s&&(s.disabled=!0);let c=await o(n,a);if(s&&(s.disabled=!1),!c.ok||!c.body?.comment){i&&(i.value=a),r(`Couldn't post comment — try again.`);return}let l=c.body.comment;z[n]||(z[n]=[]),z[n].push(l);let u=t.closest(`.feed-thread`);u&&G(u,n,z[n]);let d=u?.querySelector(`input[name="body"]`);d&&d.focus();let f=R.find(e=>e.id===n);if(f){f.comment_count=(f.comment_count||0)+1;let e=((u?.closest(`.feed-event`))?.querySelector(`.feed-comment-btn`))?.parentElement?.querySelector(`.feed-action-count`);e&&(e.textContent=String(f.comment_count))}}),m(),x(),e}var q=t();function J(){let e=(0,x.useRef)(null);return(0,x.useEffect)(()=>{let t=e.current;t&&(t.innerHTML=``,t.appendChild(K()))},[]),(0,q.jsx)(`div`,{ref:e})}function Y(e){m(e,(0,x.createElement)(J))}export{Y as mountFeed};
//# sourceMappingURL=mount-CAOOQWAh.js.map