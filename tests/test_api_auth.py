"""Auth-route tests — /api/auth/google identity reconciliation (F1-B1).

The production login branch is driven the same way as in
tests/test_api_security.py: we monkeypatch `id_token.verify_oauth2_token`
so the handler runs its real INSERT/upsert logic without a network call
to Google's OAuth backend.
"""


def test_auth_google_same_email_new_sub_reconciles_not_500(client, monkeypatch):
    """F1-B1: Google can rotate a user's `sub` (id-token subject) while the
    verified email stays the same (a Workspace migration, account-type
    change, or Google's own opaque re-issuance).

    Our `users.id` column IS the sub and `users.email` is UNIQUE, so the
    login handler's `INSERT ... ON CONFLICT(id)` for the NEW sub collides
    on the EMAIL constraint (not the id) and raises sqlite3.IntegrityError
    — which `except ValueError` does NOT catch → a login 500.

    The handler must instead reconcile to the existing account (matching
    on the Google-verified email), keeping that account's original id so
    none of the user's FK-linked data is orphaned. Pin: the second login
    returns 200 with the ORIGINAL id + the returning user's profile
    fields, not a 500 and not a duplicate account.
    """
    monkeypatch.setenv("CLIENT_ID_GOOGLE_AUTH", "client-id-test")
    monkeypatch.delenv("GG_ALLOW_TEST_LOGIN", raising=False)

    email = "rotate@example.com"
    idinfo = {
        "sub": "old-sub-111",
        "email": email,
        "email_verified": True,
        "name": "Rotating User",
        "picture": "",
    }

    import routes.auth

    monkeypatch.setattr(routes.auth.id_token, "verify_oauth2_token", lambda *a, **k: idinfo)

    # First sign-in with the ORIGINAL sub → creates the account.
    res1 = client.post("/api/auth/google", json={"token": "first.signin"})
    assert res1.status_code == 200
    assert res1.get_json()["user"]["id"] == "old-sub-111"

    # Give the account some profile state the way /api/profile/update would,
    # so we can prove reconciliation lands on the SAME row (data preserved).
    from database import get_db

    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "UPDATE users SET bio = ?, home_currency = ? WHERE id = ?",
            ("Frequent flyer", "USD", "old-sub-111"),
        )
        conn.commit()

    # Google now returns a DIFFERENT sub for the SAME verified email.
    idinfo["sub"] = "new-sub-222"

    res2 = client.post("/api/auth/google", json={"token": "second.signin"})
    # Pre-fix this was a 500 (UNIQUE constraint failed: users.email).
    assert res2.status_code == 200
    body = res2.get_json()
    assert body["status"] == "success"
    # Reconciled to the EXISTING account — original id, not the new sub.
    assert body["user"]["id"] == "old-sub-111"
    assert body["user"]["email"] == email
    # Profile state on the original row is preserved (no orphaned data,
    # no duplicate account).
    assert body["user"]["bio"] == "Frequent flyer"
    assert body["user"]["homeCurrency"] == "USD"

    # Exactly ONE row for this email — no duplicate account was created.
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT id FROM users WHERE email = ?", (email,))
        rows = c.fetchall()
    assert len(rows) == 1
    assert rows[0]["id"] == "old-sub-111"


def test_test_login_response_includes_home_country(client, monkeypatch):
    """F1-B3: the GG_ALLOW_TEST_LOGIN response must carry the SAME user-shape
    keys as real login + /api/user-status. Pre-fix it returned homeCurrency /
    language / isCreator but omitted homeCountry — leaving STATE.user.homeCountry
    undefined until the next boot probe, so the home-country flag/tile paints
    blank on first login.

    A brand-new test user is created with only id/email/name/picture, so
    home_country is always NULL; pin that the key is PRESENT and None (not
    absent), mirroring the real-login path's db_home_country for a new row.
    """
    monkeypatch.setenv("GG_ALLOW_TEST_LOGIN", "1")

    res = client.post("/api/auth/google", json={"token": "test:test-country-user"})
    assert res.status_code == 200
    user = res.get_json()["user"]

    # The key must exist (an absent key leaves the frontend field undefined).
    assert "homeCountry" in user
    assert user["homeCountry"] is None

    # Shape parity with the real-login / user-status user object.
    for key in (
        "id",
        "name",
        "email",
        "picture",
        "bio",
        "status",
        "homeCurrency",
        "homeCountry",
        "language",
        "isCreator",
    ):
        assert key in user
