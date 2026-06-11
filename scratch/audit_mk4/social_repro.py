"""MK4 social/feed audit harness — throwaway. Reproduces the two sim
flags (SOCIAL-2, SOCIAL-3) precisely and exercises every social action
end-to-end. Delete after the audit.

Uses the in-process Flask test client (conftest `client` fixture) but
seeds MANY users via test-login so we can build a real social graph.
"""
import json
import uuid

import pytest


def _login(client, uid, name=None):
    """Seed a user + return (uid, headers) using a Bearer token issued
    directly (NO cookie). We must NOT use the /api/auth/google route here:
    it Set-Cookies gg_session, and the Flask test client persists that
    cookie across requests, so the LAST-logged-in user's cookie would
    auth EVERY subsequent request (cookie wins over Bearer in
    _extract_token). Issuing the token directly + keeping the client's
    cookie jar empty makes each request authenticate purely by its own
    Bearer header — i.e. true per-user isolation, matching real browsers
    that are one-user-per-jar. uid MUST start with test-."""
    from database import get_db
    from auth import issue_token
    with get_db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO users (id, email, name, picture) VALUES (?, ?, ?, ?)",
            (uid, f"{uid}@example.com", name or uid, ""),
        )
        conn.commit()
    tok = issue_token(uid)
    return uid, {"Authorization": f"Bearer {tok}", "Origin": "http://localhost"}


def _trip(client, headers, name="Trip", **fields):
    tid = "trip-" + uuid.uuid4().hex[:12]
    body = {"id": tid, "name": name, "country": "Portugal", "countryCode": "PT"}
    body.update(fields)
    r = client.post("/api/trips", json={"trip": body}, headers=headers)
    return tid, r


def _events(resp):
    j = resp.get_json()
    if isinstance(j, list):
        return [e for e in j if isinstance(e, dict)]
    if isinstance(j, dict):
        return [e for e in (j.get("events") or j.get("items") or []) if isinstance(e, dict)]
    return []


def _mentions(e, tid):
    t = e.get("trip")
    if isinstance(t, dict) and t.get("id") == tid:
        return True
    eid = e.get("id")
    return isinstance(eid, str) and tid in eid


# ─────────────────────────────────────────────────────────────────────
# SOCIAL-3 — the priority adjudication
# ─────────────────────────────────────────────────────────────────────

def test_social3_exact_sim_repro(client):
    """Reproduce the EXACT sim sequence: edit_trip(isPublic=False) is a
    PARTIAL payload (no name). Does the flip even happen?"""
    a_uid, a = _login(client, "test-s3a")
    f_uid, f = _login(client, "test-s3f")
    tid, _ = _trip(client, a, "Will Go Private", isPublic=True)
    client.post("/api/feed/share", json={"trip_id": tid, "caption": "see my trip"}, headers=a)
    # follower one-way follows A
    client.post(f"/api/follows/{a_uid}", headers=f)
    before = [e for e in _events(client.get("/api/feed", headers=f)) if _mentions(e, tid)]
    assert before, "precondition: follower should see the public share"

    # THE EXACT SIM CALL: edit_trip(tid, isPublic=False) → body has NO name
    r = client.post("/api/trips", json={"trip": {"id": tid, "isPublic": False}}, headers=a)
    sim_flip_status = r.status_code

    # what is is_public now?
    from database import get_db
    with get_db() as conn:
        row = conn.execute("SELECT is_public, name FROM trips WHERE id = ?", (tid,)).fetchone()
    is_public_after_sim_flip = row["is_public"]
    name_after = row["name"]

    after = [e for e in _events(client.get("/api/feed", headers=f)) if _mentions(e, tid)]

    print(f"\n[SOCIAL-3 sim-exact] edit_trip(isPublic=False) status={sim_flip_status}")
    print(f"[SOCIAL-3 sim-exact] is_public after = {is_public_after_sim_flip}, name={name_after!r}")
    print(f"[SOCIAL-3 sim-exact] follower still sees share = {bool(after)}")
    # Document the harness artifact: the partial payload is rejected, trip stays public
    assert sim_flip_status == 400, "EXPECTED the partial-payload flip to 400 (no name)"
    assert is_public_after_sim_flip == 1, "trip stayed public because the flip was rejected"


def test_social3_real_flip_full_payload(client):
    """The REAL behaviour: a proper full-payload isPublic=False flip.
    Does the share card disappear from the follower's feed?"""
    a_uid, a = _login(client, "test-s3a2")
    f_uid, f = _login(client, "test-s3f2")
    tid, _ = _trip(client, a, "Will Go Private", isPublic=True)
    client.post("/api/feed/share", json={"trip_id": tid, "caption": "see my trip"}, headers=a)
    client.post(f"/api/follows/{a_uid}", headers=f)
    before = [e for e in _events(client.get("/api/feed", headers=f)) if _mentions(e, tid)]
    assert before, "precondition: follower sees public share"

    # FULL payload flip to private (what the real frontend Edit-Trip sends)
    r = client.post("/api/trips", json={
        "trip": {"id": tid, "name": "Will Go Private", "country": "Portugal",
                 "countryCode": "PT", "isPublic": False},
    }, headers=a)
    assert r.status_code == 200, f"full flip should succeed: {r.get_data(as_text=True)[:200]}"

    from database import get_db
    with get_db() as conn:
        is_pub = conn.execute("SELECT is_public FROM trips WHERE id = ?", (tid,)).fetchone()["is_public"]
    assert is_pub == 0, "full flip should set is_public=0"

    all_after = [e for e in _events(client.get("/api/feed", headers=f)) if _mentions(e, tid)]
    share_after = [e for e in all_after if e.get("type") in ("friend_shared_trip", "friend_reposted_trip")]
    other_after = [e for e in all_after if e.get("type") not in ("friend_shared_trip", "friend_reposted_trip")]
    print(f"\n[SOCIAL-3 real-flip] is_public={is_pub}")
    print(f"[SOCIAL-3 real-flip] SHARE card still visible = {bool(share_after)}")
    print(f"[SOCIAL-3 real-flip] OTHER events still leaking trip = {[e.get('type') for e in other_after]}")
    # The SOCIAL-3 fix targets the share/repost builders specifically:
    assert not share_after, "SOCIAL-3 REGRESSION: SHARE card still visible after private flip"
    # Document the adjacent leak (sibling-agent scope) without failing this test:
    if other_after:
        print(f"[SOCIAL-3 NOTE] adjacent leak via non-share builders: {[e.get('id') for e in other_after]}")


def test_social3_engagement_gate_after_private(client):
    """After private flip, a one-way-follower must not be able to like/comment
    the share (engagement gate). Author/members still can."""
    a_uid, a = _login(client, "test-s3a3")
    f_uid, f = _login(client, "test-s3f3")
    tid, _ = _trip(client, a, "Engage Private", isPublic=True)
    sh = client.post("/api/feed/share", json={"trip_id": tid}, headers=a)
    post_id = sh.get_json()["post_id"]
    event_id = f"share_{post_id}"
    client.post(f"/api/follows/{a_uid}", headers=f)
    # while public a stranger-follower can like
    r_pub = client.post(f"/api/feed/like/{event_id}", headers=f)
    assert r_pub.status_code == 200, "public share is likeable by follower"
    # flip private (full payload)
    client.post("/api/trips", json={"trip": {"id": tid, "name": "Engage Private",
                "country": "Portugal", "countryCode": "PT", "isPublic": False}}, headers=a)
    r_priv = client.post(f"/api/feed/comment/{event_id}", json={"body": "hi"}, headers=f)
    print(f"\n[SOCIAL-3 engage] comment after private = {r_priv.status_code}")
    assert r_priv.status_code == 404, "follower must not comment a now-private share"
    # author can still comment
    r_owner = client.post(f"/api/feed/comment/{event_id}", json={"body": "mine"}, headers=a)
    assert r_owner.status_code == 200, "author can still comment own private share"


# ─────────────────────────────────────────────────────────────────────
# SOCIAL-2 — block repost adjudication
# ─────────────────────────────────────────────────────────────────────

def test_social2_block_repost_public(client):
    """SOCIAL-2: A shares a PUBLIC trip, A blocks B, B tries to repost.
    Confirm 404 ('Unknown or unauthorised event') is correct."""
    a_uid, a = _login(client, "test-s2a")
    b_uid, b = _login(client, "test-s2b")
    tid, _ = _trip(client, a, "Public Share Trip", isPublic=True)
    sh = client.post("/api/feed/share", json={"trip_id": tid, "caption": "public!"}, headers=a)
    post_id = sh.get_json()["post_id"]
    client.post(f"/api/blocks/{b_uid}", headers=a)
    r = b.copy() if False else client.post(f"/api/feed/repost/{post_id}", headers=b)
    print(f"\n[SOCIAL-2] blocked repost status={r.status_code} body={r.get_data(as_text=True)[:120]}")
    assert r.status_code == 404, "blocked user reposting public post should 404 (anti-enumeration)"
    # And no repost row was created
    from database import get_db
    with get_db() as conn:
        cnt = conn.execute(
            "SELECT COUNT(*) c FROM feed_posts WHERE user_id = ? AND repost_of_post_id = ?",
            (b_uid, post_id)).fetchone()["c"]
    assert cnt == 0, "no repost row should exist"


# ─────────────────────────────────────────────────────────────────────
# Share to feed — full lifecycle
# ─────────────────────────────────────────────────────────────────────

def test_share_sets_token_and_explore(client):
    """Share-to-feed mints share_token + flips public → trip appears in a
    stranger's Explore (MK2 BUG-44 'Explore permanently empty')."""
    a_uid, a = _login(client, "test-shA")
    s_uid, s = _login(client, "test-shS")  # stranger viewer
    tid, _ = _trip(client, a, "Explore Me", isPublic=False)
    sh = client.post("/api/feed/share", json={"trip_id": tid}, headers=a)
    assert sh.status_code == 200
    from database import get_db
    with get_db() as conn:
        row = conn.execute("SELECT is_public, share_token FROM trips WHERE id = ?", (tid,)).fetchone()
    assert row["is_public"] == 1, "share auto-promotes to public"
    assert row["share_token"], "share mints a share_token (BUG-44)"
    er = client.get("/api/feed/explore", headers=s)
    assert er.status_code == 200
    items = er.get_json().get("items", [])
    assert any(it.get("tripId") == tid for it in items), "shared trip appears in stranger's Explore"


def test_share_idempotent_and_unshare_scrubs(client):
    """Re-share returns same post_id (no dup). Unshare scrubs the card +
    restores privacy when share auto-promoted it."""
    a_uid, a = _login(client, "test-uns")
    tid, _ = _trip(client, a, "Unshare Me", isPublic=False)
    sh1 = client.post("/api/feed/share", json={"trip_id": tid, "caption": "v1"}, headers=a)
    pid1 = sh1.get_json()["post_id"]
    sh2 = client.post("/api/feed/share", json={"trip_id": tid, "caption": "v2"}, headers=a)
    assert sh2.get_json()["post_id"] == pid1, "re-share idempotent (same post_id)"
    assert sh2.get_json()["status"] == "already_shared"
    # unshare
    d = client.delete(f"/api/feed/share/{pid1}", headers=a)
    assert d.status_code == 200
    from database import get_db
    with get_db() as conn:
        n = conn.execute("SELECT COUNT(*) c FROM feed_posts WHERE id = ?", (pid1,)).fetchone()["c"]
        is_pub = conn.execute("SELECT is_public FROM trips WHERE id = ?", (tid,)).fetchone()["is_public"]
    assert n == 0, "unshare deletes the feed_post"
    # SOC-1 BUG (documented): re-sharing a private trip that was already
    # auto-promoted to public on share#1 REFRESHES trip_was_public to the
    # now-current value (1), clobbering the original snapshot (0). Unshare
    # then declines to restore privacy → the trip stays PUBLIC. Expected
    # value here SHOULD be 0; it is 1, which is the bug.
    print(f"\n[SOC-1 re-share snapshot clobber] is_public after unshare = {is_pub} (BUG: expected 0)")
    assert is_pub == 1, "SOC-1: re-share clobbered the restore snapshot — trip leaked public"


def test_share_archived_refused(client):
    a_uid, a = _login(client, "test-sharc")
    tid, _ = _trip(client, a, "Archived", isPublic=True)
    client.post(f"/api/trips/{tid}/archive", headers=a)
    r = client.post("/api/feed/share", json={"trip_id": tid}, headers=a)
    print(f"\n[share archived] status={r.status_code}")
    assert r.status_code == 409, "cannot share an archived trip"


# ─────────────────────────────────────────────────────────────────────
# Repost — public-trip likeable/commentable (MK2 BUG-20)
# ─────────────────────────────────────────────────────────────────────

def test_repost_public_then_engage(client):
    """A stranger reposts a PUBLIC share; the reposted card must be
    likeable + commentable (not inert/404) — MK2 BUG-20."""
    a_uid, a = _login(client, "test-rpA")
    b_uid, b = _login(client, "test-rpB")  # stranger reposter
    tid, _ = _trip(client, a, "Public Repost Trip", isPublic=True)
    sh = client.post("/api/feed/share", json={"trip_id": tid, "caption": "hello"}, headers=a)
    orig_post = sh.get_json()["post_id"]
    rp = client.post(f"/api/feed/repost/{orig_post}", headers=b)
    assert rp.status_code == 200, f"stranger can repost public share: {rp.get_data(as_text=True)[:160]}"
    new_post = rp.get_json()["post_id"]
    repost_event = f"repost_{new_post}"
    # a third stranger likes + comments the REPOST
    c_uid, c = _login(client, "test-rpC")
    rl = client.post(f"/api/feed/like/{repost_event}", headers=c)
    rc = client.post(f"/api/feed/comment/{repost_event}", json={"body": "nice"}, headers=c)
    print(f"\n[BUG-20] repost like={rl.status_code} comment={rc.status_code}")
    assert rl.status_code == 200, "repost of public trip must be likeable (BUG-20)"
    assert rc.status_code == 200, "repost of public trip must be commentable (BUG-20)"


def test_repost_private_friend_gate(client):
    """Repost of a PRIVATE trip's share: only friend-of-author/member can.
    A stranger gets 404."""
    a_uid, a = _login(client, "test-rprivA")
    stranger_uid, stranger = _login(client, "test-rprivS")
    tid, _ = _trip(client, a, "Private Trip", isPublic=True)
    sh = client.post("/api/feed/share", json={"trip_id": tid}, headers=a)
    pid = sh.get_json()["post_id"]
    # flip private (full payload)
    client.post("/api/trips", json={"trip": {"id": tid, "name": "Private Trip",
                "country": "Portugal", "countryCode": "PT", "isPublic": False}}, headers=a)
    r = client.post(f"/api/feed/repost/{pid}", headers=stranger)
    print(f"\n[repost private] stranger repost status={r.status_code}")
    assert r.status_code == 404, "stranger cannot repost a now-private share"


# ─────────────────────────────────────────────────────────────────────
# Like / comment — engagement gates + block filtering (MK1 SOCIAL-6)
# ─────────────────────────────────────────────────────────────────────

def test_comment_block_filter_and_counts(client):
    """After A blocks B, B's historical comments vanish from A's view
    (SOCIAL-6). Like counts: blocked user's like removed on block."""
    a_uid, a = _login(client, "test-cbA")
    b_uid, b = _login(client, "test-cbB")
    tid, _ = _trip(client, a, "Comment Trip", isPublic=True)
    sh = client.post("/api/feed/share", json={"trip_id": tid}, headers=a)
    pid = sh.get_json()["post_id"]
    ev = f"share_{pid}"
    client.post(f"/api/feed/comment/{ev}", json={"body": "B was here"}, headers=b)
    client.post(f"/api/feed/like/{ev}", headers=b)
    # before block: A sees B's comment
    before = client.get(f"/api/feed/comments/{ev}", headers=a).get_json()
    assert any(c["body"] == "B was here" for c in before), "A sees B's comment pre-block"
    # A blocks B
    client.post(f"/api/blocks/{b_uid}", headers=a)
    after = client.get(f"/api/feed/comments/{ev}", headers=a).get_json()
    assert not any(c.get("body") == "B was here" for c in after), "B's comment hidden after block (SOCIAL-6)"
    # like count: B's like was swept on block
    from database import get_db
    with get_db() as conn:
        likes = conn.execute("SELECT COUNT(*) c FROM feed_likes WHERE event_id = ?", (ev,)).fetchone()["c"]
    print(f"\n[SOCIAL-6] likes after block = {likes}")
    assert likes == 0, "blocked user's like swept from count"


def test_no_engage_invisible_content(client):
    """Crafted/unknown event_id and content you can't see → 404, no write."""
    a_uid, a = _login(client, "test-inv")
    r1 = client.post("/api/feed/like/share_999999", headers=a)
    r2 = client.post("/api/feed/like/totally_fake_id", headers=a)
    r3 = client.post("/api/feed/comment/share_999999", json={"body": "x"}, headers=a)
    assert r1.status_code == 404 and r2.status_code == 404 and r3.status_code == 404


# ─────────────────────────────────────────────────────────────────────
# Bookmark
# ─────────────────────────────────────────────────────────────────────

def test_bookmark_save_unsave_and_visibility_gate(client):
    a_uid, a = _login(client, "test-bmA")
    tid, _ = _trip(client, a, "Bookmark Trip", isPublic=True)
    sh = client.post("/api/feed/share", json={"trip_id": tid}, headers=a)
    pid = sh.get_json()["post_id"]
    ev = f"share_{pid}"
    r1 = client.post(f"/api/feed/bookmark/{ev}", headers=a)
    assert r1.get_json()["bookmarked"] is True
    r2 = client.post(f"/api/feed/bookmark/{ev}", headers=a)
    assert r2.get_json()["bookmarked"] is False, "second toggle unsaves"
    # cannot bookmark content you can't see
    stranger_uid, stranger = _login(client, "test-bmS")
    tid2, _ = _trip(client, a, "Private BM", isPublic=False)
    sh2 = client.post("/api/feed/share", json={"trip_id": tid2}, headers=a)
    pid2 = sh2.get_json()["post_id"]
    client.post("/api/trips", json={"trip": {"id": tid2, "name": "Private BM",
                "country": "Portugal", "countryCode": "PT", "isPublic": False}}, headers=a)
    r3 = client.post(f"/api/feed/bookmark/share_{pid2}", headers=stranger)
    assert r3.status_code == 404, "stranger cannot bookmark a private share"


def test_bookmark_persists_but_loses_access(client):
    """Bookmark a public share, then it goes private. The bookmark ROW
    persists but the event no longer surfaces — is the bookmark
    re-readable? (where do bookmarks surface?)"""
    a_uid, a = _login(client, "test-bmpA")
    f_uid, f = _login(client, "test-bmpF")
    tid, _ = _trip(client, a, "BM Persist", isPublic=True)
    sh = client.post("/api/feed/share", json={"trip_id": tid}, headers=a)
    pid = sh.get_json()["post_id"]
    ev = f"share_{pid}"
    client.post(f"/api/follows/{a_uid}", headers=f)
    client.post(f"/api/feed/bookmark/{ev}", headers=f)
    # flip private
    client.post("/api/trips", json={"trip": {"id": tid, "name": "BM Persist",
                "country": "Portugal", "countryCode": "PT", "isPublic": False}}, headers=a)
    from database import get_db
    with get_db() as conn:
        still = conn.execute("SELECT COUNT(*) c FROM feed_bookmarks WHERE user_id=? AND event_id=?",
                             (f_uid, ev)).fetchone()["c"]
    feed_now = [e for e in _events(client.get("/api/feed", headers=f)) if _mentions(e, tid)]
    print(f"\n[bookmark orphan] row persists={still}, surfaces in feed={bool(feed_now)}")
    # This documents whether there is a bookmarks-listing surface at all.


# ─────────────────────────────────────────────────────────────────────
# Explore — privacy-scoped + archived excluded
# ─────────────────────────────────────────────────────────────────────

def test_explore_excludes_archived_and_private(client):
    a_uid, a = _login(client, "test-exA")
    s_uid, s = _login(client, "test-exS")
    # private trip with share_token (one-off link) must NOT appear
    tid_priv, _ = _trip(client, a, "Priv Link", isPublic=False)
    client.post(f"/api/trips/{tid_priv}/share", json={}, headers=a)  # mints token, stays private
    # public+shared trip appears, then archive it → disappears
    tid_pub, _ = _trip(client, a, "Pub Shared", isPublic=True)
    client.post("/api/feed/share", json={"trip_id": tid_pub}, headers=a)
    items = client.get("/api/feed/explore", headers=s).get_json()["items"]
    assert any(it["tripId"] == tid_pub for it in items), "public shared trip in explore"
    assert not any(it["tripId"] == tid_priv for it in items), "private one-off-link trip NOT in explore"
    # archive the public one
    client.post(f"/api/trips/{tid_pub}/archive", headers=a)
    items2 = client.get("/api/feed/explore", headers=s).get_json()["items"]
    arch_present = any(it["tripId"] == tid_pub for it in items2)
    print(f"\n[explore archived] archived trip still in explore = {arch_present} (BUG: expected False)")
    # SOC-2 BUG (documented): explore query filters is_public+share_token
    # but NOT is_archived, so an archived public trip keeps surfacing.
    assert arch_present is True, "SOC-2: explore should exclude archived trips but doesn't"


# ─────────────────────────────────────────────────────────────────────
# Notifications — dedupe + scrub
# ─────────────────────────────────────────────────────────────────────

def test_notif_unlike_scrubs(client):
    a_uid, a = _login(client, "test-nfA")
    b_uid, b = _login(client, "test-nfB")
    tid, _ = _trip(client, a, "Notif Trip", isPublic=True)
    sh = client.post("/api/feed/share", json={"trip_id": tid}, headers=a)
    pid = sh.get_json()["post_id"]
    ev = f"share_{pid}"
    client.post(f"/api/feed/like/{ev}", headers=b)  # like → notif
    nl = client.get("/api/notifications/list", headers=a).get_json()
    assert any(n["type"] == "share_liked" for n in nl["notifications"]), "like fires notif"
    client.post(f"/api/feed/like/{ev}", headers=b)  # unlike → scrub
    nl2 = client.get("/api/notifications/list", headers=a).get_json()
    assert not any(n["type"] == "share_liked" for n in nl2["notifications"]), "unlike scrubs notif"


def test_notif_no_self_and_blocked(client):
    a_uid, a = _login(client, "test-nfsA")
    b_uid, b = _login(client, "test-nfsB")
    tid, _ = _trip(client, a, "Self Notif", isPublic=True)
    sh = client.post("/api/feed/share", json={"trip_id": tid}, headers=a)
    ev = f"share_{sh.get_json()['post_id']}"
    client.post(f"/api/feed/like/{ev}", headers=a)  # self-like → no notif
    nl = client.get("/api/notifications/list", headers=a).get_json()
    assert not any(n["type"] == "share_liked" for n in nl["notifications"]), "no self-notif"
    # blocked actor: A blocks B, B likes → no bell
    client.post(f"/api/blocks/{b_uid}", headers=a)
    client.post(f"/api/feed/like/{ev}", headers=b)
    nl2 = client.get("/api/notifications/list", headers=a).get_json()
    assert not any(n["type"] == "share_liked" and n["relatedId"] == b_uid
                   for n in nl2["notifications"]), "blocked actor's like doesn't notify"
