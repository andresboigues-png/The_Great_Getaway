"""MK4: brand-new users get the 3 starter expense categories seeded
server-side on first login (auth.py `_seed_default_categories`), so the
expense form / budgets / Personalization aren't empty on first run.

Regression context: when categories moved to the per-row /api/categories
delta endpoint, the frontend's STATE defaults stopped being pushed to the
server, so a new user's first /api/data pull returned `categories: []` and
wiped the local defaults. The server now seeds them on account creation.

The seed is idempotent (re-login never duplicates) and never resurrects
categories a user deliberately deleted (gated on zero categories AND no
deletion history). Exercised through the real /api/auth/google route, since
that's where the seed runs (the conftest auth_headers fixture mints tokens
directly and bypasses it).
"""

import pytest


@pytest.fixture(autouse=True)
def _enable_test_login(monkeypatch):
    monkeypatch.setenv("GG_ALLOW_TEST_LOGIN", "1")


def _login(client, uid):
    return client.post("/api/auth/google", json={"token": f"test:{uid}", "name": uid})


def _category_names(client):
    # The login set the gg_session cookie on the test client, so GET is
    # authenticated as that user.
    data = client.get("/api/data").get_json()
    return sorted(c["name"] for c in (data.get("categories") or []))


def test_new_user_seeded_with_default_categories(client):
    assert _login(client, "test-seedcat-1").status_code == 200
    assert _category_names(client) == ["Accommodation", "Food", "Transport"]


def test_seed_is_idempotent_across_logins(client):
    _login(client, "test-seedcat-2")
    assert len(_category_names(client)) == 3
    _login(client, "test-seedcat-2")  # second login, same user
    assert len(_category_names(client)) == 3  # not 6 — no duplicate seed


def test_deleted_categories_not_resurrected(client):
    _login(client, "test-seedcat-3")
    assert len(_category_names(client)) == 3
    # Simulate the user clearing their categories: drop the rows + record
    # tombstones (what the per-row delete path writes).
    from database import get_db

    with get_db() as conn:
        conn.execute("DELETE FROM categories WHERE user_id = ?", ("test-seedcat-3",))
        for cid in ("c1", "c2", "c3"):
            conn.execute(
                "INSERT OR IGNORE INTO category_deletes (user_id, category_id, deleted_at) "
                "VALUES (?, ?, ?)",
                ("test-seedcat-3", cid, 9999999999999),
            )
        conn.commit()
    _login(client, "test-seedcat-3")  # re-login must NOT re-seed
    assert _category_names(client) == [], "deliberately-deleted categories must not be re-seeded"
