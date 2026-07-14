"""Anonymous visit log (services/visits.py) + the admin traffic endpoint
(/api/admin/visits). Pins the privacy contract (no raw IP, bot-skip) and the
admin gate."""

from database import get_db

# A real mobile-Safari UA so the bot filter lets it through.
_BROWSER_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)


def _admin_headers():
    """Insert the allowlisted owner + return its auth header."""
    from auth import issue_token

    uid = "admin-user"
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name, picture) VALUES (?, ?, ?, ?)",
            (uid, "andres.boigues@gmail.com", "Owner", None),
        )
        conn.commit()
    return {"Authorization": f"Bearer {issue_token(uid)}"}


def test_landing_logs_visit_and_sets_cookie(client):
    res = client.get(
        "/",
        headers={"User-Agent": _BROWSER_UA, "Referer": "https://www.linkedin.com/feed/"},
    )
    assert res.status_code == 200
    # First-party gg_vid cookie is set on a new visitor.
    assert any("gg_vid=" in c for c in res.headers.getlist("Set-Cookie"))

    with get_db() as conn:
        rows = conn.execute("SELECT * FROM visits").fetchall()
    assert len(rows) == 1
    r = rows[0]
    assert r["referrer_host"] == "linkedin.com"
    assert r["device"] == "mobile"
    assert r["browser"] == "Safari"
    # Privacy contract: a hash is stored, never a raw IP.
    assert r["ip_hash"]
    assert "." not in (r["ip_hash"] or "")
    assert ":" not in (r["ip_hash"] or "")


def test_landing_skips_bots(client):
    client.get("/", headers={"User-Agent": "LinkedInBot/1.0 (compatible; Mozilla/5.0)"})
    client.get("/", headers={"User-Agent": "facebookexternalhit/1.1"})
    client.get("/", headers={"User-Agent": ""})  # empty UA → treated as automated
    with get_db() as conn:
        n = conn.execute("SELECT COUNT(*) AS n FROM visits").fetchone()["n"]
    assert n == 0


def test_admin_visits_forbidden_for_non_admin(client, auth_headers):
    # seed_user is test@example.com — not on the allowlist.
    res = client.get("/api/admin/visits", headers=auth_headers)
    assert res.status_code == 403


def test_admin_visits_returns_traffic(client):
    headers = _admin_headers()
    # Two landings from LinkedIn (lnkd.in normalises to linkedin.com); same
    # client keeps the cookie, so it's one unique visitor, two visits.
    client.get("/", headers={"User-Agent": _BROWSER_UA, "Referer": "https://www.linkedin.com/"})
    client.get("/", headers={"User-Agent": _BROWSER_UA, "Referer": "https://lnkd.in/xyz"})

    res = client.get("/api/admin/visits", headers=headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body["totalVisits"] >= 2
    assert body["uniqueVisitors"] >= 1
    refs = {r["key"]: r["count"] for r in body["referrers"]}
    assert refs.get("linkedin.com", 0) >= 2
    assert isinstance(body["byDay"], list)
    assert isinstance(body["devices"], list)
