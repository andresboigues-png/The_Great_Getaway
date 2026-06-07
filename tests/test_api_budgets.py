"""GG API tests — Budget CRUD, scope-uniqueness, category sync, split-validator edge.

Split out of the former tests/test_api.py monolith (pure reorg — no
test logic changed). Shared fixtures (client, auth_headers, seed_user,
...) come from tests/conftest.py.
"""


import pytest

from tests.conftest import _create_trip, _seed_member


def test_validate_splits_drops_all_zero_on_lenient_path():
    """IA-2 (Insights audit MK3): an all-zero split is degenerate — the
    balance reducer's `denom = total>0 ? total : 100` fallback credits the
    payer while debiting nobody, breaking Σ balances = 0. validate_splits now
    collapses all-zero to None on BOTH paths (the lenient bulk/sync path used
    to STORE it verbatim), so the expense falls back to the Σ-safe equal-share
    path. Odd-but-NONZERO sums still pass through unchanged on the lenient path.
    """
    from validators import ValidationError, validate_splits

    # Lenient (sync) path: all-zero → None (was: stored verbatim → Σ break).
    assert validate_splits({"a": 0, "b": 0}) is None
    # Strict (per-row) path: all-zero → ValidationError (must sum ~100).
    with pytest.raises(ValidationError):
        validate_splits({"a": 0, "b": 0}, require_full=True)
    # Odd-but-nonzero legacy sum survives the lenient path unchanged.
    assert validate_splits({"a": 99, "b": 1}) == {"a": 99.0, "b": 1.0}
    # A single tiny nonzero value is NOT all-zero → survives.
    assert validate_splits({"a": 0, "b": 0.5}) == {"a": 0.0, "b": 0.5}


# ── /api/budgets ─────────────────────────────────────────────────────────────
# Budgets are per-user (not per-trip), so the gate is "caller owns this
# budget row". The audit fix replaced the previous "delete by id alone"
# path that let any caller wipe anyone's budget by guessing an id.

def test_upsert_budget_happy_path(client, seed_user, auth_headers):
    """Owner can create + update their own budget."""
    # §1.4 FK enforcement: budgets.trip_id is now a real FK to trips(id)
    # with ON DELETE SET NULL. Seed the trip first so the budget insert
    # doesn't trip the constraint. Before §1.4 this worked silently
    # because foreign_keys=OFF treated the FK as advisory.
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Test trip", "country": "FR"},
    })
    res = client.post("/api/budgets", headers=auth_headers, json={
        "budget": {
            "id": "budget-1", "tripId": "trip-1", "label": "Food",
            "amount": 200, "currency": "EUR",
        },
    })
    assert res.status_code == 200


def test_budget_trip_scope_requires_money_edit_role(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """BUG-34 + BUG-36 (MK2 audit): a TRIP-scoped budget requires the
    caller to be a member of that trip with money-edit rights. A
    non-member (BUG-36) and a relaxer (BUG-34) are both refused; the
    owner is allowed, and a GLOBAL (no-trip) budget stays ungated."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-bud-acl")

    def bud(bid):
        return {
            "id": bid, "tripId": trip_id, "categoryId": "all", "user": "all",
            "amount": 100, "originalAmount": 100, "originalCurrency": "EUR",
        }

    # Non-member → 403 (BUG-36).
    r1 = client.post("/api/budgets", headers=other_auth_headers,
                     json={"budget": bud("b-nonmember")})
    assert r1.status_code == 403, r1.get_data(as_text=True)
    # Relaxer member → still 403 (BUG-34: read-only role can't manage money).
    _seed_member(trip_id, seed_other_user, role="relaxer")
    r2 = client.post("/api/budgets", headers=other_auth_headers,
                     json={"budget": bud("b-relaxer")})
    assert r2.status_code == 403, r2.get_data(as_text=True)
    # Owner → allowed (positive control: the gate doesn't block legit writes).
    r3 = client.post("/api/budgets", headers=auth_headers,
                     json={"budget": bud("b-owner")})
    assert r3.status_code == 200, r3.get_data(as_text=True)
    # Global budget (no trip) by the non-member → ungated, allowed.
    g = client.post("/api/budgets", headers=other_auth_headers, json={
        "budget": {"id": "b-global", "tripId": "all", "categoryId": "all",
                   "user": "all", "amount": 100, "originalAmount": 100,
                   "originalCurrency": "EUR"},
    })
    assert g.status_code == 200, g.get_data(as_text=True)


def test_budget_category_scoped_duplicate_rejected(client, seed_user, auth_headers):
    """4.8 audit MONEY-1: a second budget with the SAME (trip, category,
    owner=None) scope but a different id must be rejected (409), not
    silently duplicated — pre-fix SQLite's NULL-distinct UNIQUE let the
    half-scoped shape through and spend double-counted."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "T", "country": "FR"},
    })
    base = {"tripId": "trip-1", "label": "Food", "amount": 200, "currency": "EUR", "categoryId": "food"}
    r1 = client.post("/api/budgets", headers=auth_headers, json={"budget": {**base, "id": "b1"}})
    assert r1.status_code == 200
    r2 = client.post("/api/budgets", headers=auth_headers, json={"budget": {**base, "id": "b2"}})
    assert r2.status_code == 409, r2.get_data(as_text=True)


def test_budget_owner_scoped_duplicate_rejected(client, seed_user, auth_headers):
    """MONEY-1: same for the owner-scoped shape (owner set, category None)."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "T", "country": "FR"},
    })
    base = {"tripId": "trip-1", "label": "Sara's", "amount": 100, "currency": "EUR", "user": "Sara"}
    assert client.post("/api/budgets", headers=auth_headers, json={"budget": {**base, "id": "b1"}}).status_code == 200
    r2 = client.post("/api/budgets", headers=auth_headers, json={"budget": {**base, "id": "b2"}})
    assert r2.status_code == 409, r2.get_data(as_text=True)


def test_budget_fully_scoped_duplicate_returns_409_not_500(client, seed_user, auth_headers):
    """4.8 audit MONEY-2: the fully-scoped duplicate used to throw an
    unhandled IntegrityError → 500. Now a clean 409."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "T", "country": "FR"},
    })
    base = {"tripId": "trip-1", "label": "Food/Sara", "amount": 50, "currency": "EUR", "categoryId": "food", "user": "Sara"}
    assert client.post("/api/budgets", headers=auth_headers, json={"budget": {**base, "id": "b1"}}).status_code == 200
    r2 = client.post("/api/budgets", headers=auth_headers, json={"budget": {**base, "id": "b2"}})
    assert r2.status_code == 409, r2.get_data(as_text=True)


def test_budget_distinct_scopes_both_allowed(client, seed_user, auth_headers):
    """MONEY-1 must not over-reject: budgets with DIFFERENT scopes (and
    editing the same budget by id) are still allowed."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "T", "country": "FR"},
    })
    r1 = client.post("/api/budgets", headers=auth_headers, json={
        "budget": {"id": "b1", "tripId": "trip-1", "label": "Food", "amount": 100, "currency": "EUR", "categoryId": "food"},
    })
    r2 = client.post("/api/budgets", headers=auth_headers, json={
        "budget": {"id": "b2", "tripId": "trip-1", "label": "Transport", "amount": 80, "currency": "EUR", "categoryId": "transport"},
    })
    assert r1.status_code == 200 and r2.status_code == 200
    # Editing b1 (same id, same scope) must not trip the dup check.
    r3 = client.post("/api/budgets", headers=auth_headers, json={
        "budget": {"id": "b1", "tripId": "trip-1", "label": "Food", "amount": 150, "currency": "EUR", "categoryId": "food"},
    })
    assert r3.status_code == 200, r3.get_data(as_text=True)


def test_upsert_budget_missing_payload(client, auth_headers):
    """POST with no `budget` key returns 400."""
    res = client.post("/api/budgets", headers=auth_headers, json={})
    assert res.status_code == 400


def test_delete_budget_only_deletes_own_budget(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Audit-fix coverage: another user's DELETE of a guessed budget id
    is a silent no-op — the WHERE clause's `user_id = ?` makes the SQL
    delete zero rows. The endpoint still returns 200/{deleted} for
    idempotency, but the row stays put for the real owner."""
    # §1.4 FK enforcement: budgets.trip_id → trips(id). Seed the trip
    # so the budget insert below survives the FK check. See companion
    # comment on test_upsert_budget_happy_path for the rationale.
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Test trip", "country": "FR"},
    })
    # Owner creates a budget
    client.post("/api/budgets", headers=auth_headers, json={
        "budget": {
            "id": "budget-mine", "tripId": "trip-1", "label": "Food",
            "amount": 200, "currency": "EUR",
        },
    })
    # Different user fires DELETE — request returns 200 but the row
    # survives because the gate is `user_id = ?` in the SQL.
    other_res = client.delete("/api/budgets/budget-mine", headers=other_auth_headers)
    assert other_res.status_code == 200

    # Owner can still delete it themselves (proves it wasn't actually
    # removed by the previous request).
    own_res = client.delete("/api/budgets/budget-mine", headers=auth_headers)
    assert own_res.status_code == 200
    assert own_res.get_json() == {"status": "deleted"}


def test_delete_budget_idempotent_on_unknown_id(client, seed_user, auth_headers):
    """DELETE on a non-existent budget returns 200 (idempotent)."""
    res = client.delete("/api/budgets/never-existed", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json() == {"status": "deleted"}


# ── /api/categories ──────────────────────────────────────────────────────────
# Replace-list endpoint: every POST overwrites the user's category set
# entirely. The frontend treats it as full-list sync (saveCategories
# fires after every reorder/add/edit/delete). Tests pin happy path +
# the empty-list "wipe everything" path so a user can intentionally
# clear their categories.

def test_sync_categories_replaces_list(client, seed_user, auth_headers):
    """First POST seeds the list; second POST with a smaller list
    replaces (doesn't merge). The DELETE-then-INSERT shape of the
    handler means partial sends are destructive on purpose."""
    client.post("/api/categories", headers=auth_headers, json={
        "categories": [
            {"id": "c1", "name": "Food", "icon": "🍔", "color": "#ff3b30"},
            {"id": "c2", "name": "Hotel", "icon": "🏨", "color": "#5856d6"},
        ],
    })
    res = client.post("/api/categories", headers=auth_headers, json={
        "categories": [
            {"id": "c1", "name": "Food", "icon": "🍔", "color": "#ff3b30"},
        ],
    })
    assert res.status_code == 200


def test_sync_categories_empty_list_clears(client, seed_user, auth_headers):
    """User can intentionally wipe their categories by POSTing an
    empty list. Empty-payload (no `categories` key) is treated the
    same — defaults to []."""
    res = client.post("/api/categories", headers=auth_headers, json={})
    assert res.status_code == 200


def test_budget_stale_clientUpdatedAt_returns_409(
    client, seed_user, auth_headers,
):
    """R3-Round 5 B2 mirror of the expense test. Budgets gate on
    clientUpdatedAt the same way."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-budget-stale")
    res = client.post("/api/budgets", headers=auth_headers, json={
        "budget": {
            "id": "bud-stale", "tripId": trip_id,
            "amount": 100, "currency": "EUR",
            "originalAmount": 100, "originalCurrency": "EUR",
            "categoryId": "all", "user": "all",
        },
    })
    assert res.status_code == 200
    first_updated_at = res.get_json().get("updatedAt")
    assert first_updated_at

    res2 = client.post("/api/budgets", headers=auth_headers, json={
        "budget": {
            "id": "bud-stale", "tripId": trip_id,
            "amount": 200, "currency": "EUR",
            "originalAmount": 200, "originalCurrency": "EUR",
            "categoryId": "all", "user": "all",
        },
    })
    assert res2.status_code == 200
    assert res2.get_json().get("updatedAt") != first_updated_at

    res3 = client.post("/api/budgets", headers=auth_headers, json={
        "budget": {
            "id": "bud-stale", "tripId": trip_id,
            "amount": 999, "currency": "EUR",
            "originalAmount": 999, "originalCurrency": "EUR",
            "categoryId": "all", "user": "all",
            "clientUpdatedAt": first_updated_at,
        },
    })
    assert res3.status_code == 409
    assert "current" in res3.get_json()
    # Row unchanged from second write.
    pull = client.get("/api/data", headers=auth_headers).get_json()
    found = next(b for b in pull["budgets"] if b["id"] == "bud-stale")
    assert found["amount"] == 200


def test_budget_rejects_no_rate_currency(client, seed_user, auth_headers):
    """IA-10 (Insights audit MK3): mirror the expense C1 gate on budgets. A
    budget in a non-EUR currency with NO live FX rate can't be converted to the
    home currency for the spent-vs-budget comparison (the frontend would fall to
    a 1:1 / €0 reading), so it's rejected (400) with the offending currency
    echoed. A currency WITH a live rate saves. The create-budget modal already
    blocks this; the gate covers the raw API / CSV-import paths."""
    import fx_rates
    fx_rates._cache = {"EUR": 1.0, "USD": 0.5}  # JPY deliberately rate-less
    fx_rates._cache_set_at = __import__('time').time()
    try:
        reject = client.post("/api/budgets", headers=auth_headers, json={
            "budget": {
                "id": "bud-ia10-jpy", "amount": 50000, "currency": "JPY",
                "label": "Tokyo food",
            },
        })
        assert reject.status_code == 400, reject.get_data(as_text=True)
        assert reject.get_json().get("currency") == "JPY"
        ok = client.post("/api/budgets", headers=auth_headers, json={
            "budget": {
                "id": "bud-ia10-usd", "amount": 100, "currency": "USD",
                "label": "USD budget",
            },
        })
        assert ok.status_code == 200, ok.get_data(as_text=True)
    finally:
        fx_rates._cache = {}
        fx_rates._cache_set_at = 0.0


def test_budget_non_eur_normalized_to_eur(client, seed_user, auth_headers):
    """Audit MK5 BUG-044: a non-EUR budget posted via the raw API (the in-app
    modal always sends EUR) is normalized to CANONICAL EUR on write, so the
    readers — which all treat budgets.amount as EUR — stay correct. The foreign
    value is preserved in original_amount/original_currency for the 'was X' badge."""
    import fx_rates
    from database import get_db
    fx_rates._cache = {"EUR": 1.0, "USD": 0.5}  # 1 USD = 0.5 EUR
    fx_rates._cache_set_at = __import__('time').time()
    try:
        res = client.post("/api/budgets", headers=auth_headers, json={
            "budget": {
                "id": "bud-bug044-usd", "amount": 100, "currency": "USD",
                "label": "USD budget",
            },
        })
        assert res.status_code == 200, res.get_data(as_text=True)
        with get_db() as conn:
            row = conn.execute(
                "SELECT amount, currency, original_amount, original_currency "
                "FROM budgets WHERE id = ?",
                ("bud-bug044-usd",),
            ).fetchone()
        assert row is not None
        assert row["currency"] == "EUR", "canonical currency must be normalized to EUR"
        assert abs(row["amount"] - 50.0) < 0.001, "amount must be the EUR value (100 USD * 0.5)"
        assert abs(row["original_amount"] - 100.0) < 0.001, "foreign amount preserved"
        assert row["original_currency"] == "USD", "foreign currency preserved for the badge"
    finally:
        fx_rates._cache = {}
        fx_rates._cache_set_at = 0.0


def test_budget_upsert_rejects_cross_user_id(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """R3-Fix #2: pre-fix, `POST /api/budgets` with another user's
    budget id silently rewrote the row in place because the ON
    CONFLICT clause had no user_id ownership gate. Now: the route
    SELECTs first and returns 404 if the existing row belongs to
    another caller (anti-enumeration: same shape as a non-existent
    id)."""
    # Victim creates a budget.
    res = client.post("/api/budgets", headers=auth_headers, json={
        "budget": {
            "id": "bud-victim", "label": "Lisbon Food",
            "amount": 300, "currency": "EUR",
        },
    })
    assert res.status_code == 200

    # Attacker tries to overwrite it with their own id reference.
    # (Use a valid non-zero amount so this exercises the cross-user
    # ownership gate — a zero amount would 400 at validation first,
    # per the MM-9 allow_zero=False rule, masking what we test here.)
    res = client.post("/api/budgets", headers=other_auth_headers, json={
        "budget": {
            "id": "bud-victim", "label": "Hijacked",
            "amount": 999, "currency": "USD",
        },
    })
    assert res.status_code == 404

    # Verify the victim's row is unchanged.
    from database import get_db
    with get_db() as conn:
        row = conn.execute(
            "SELECT label, amount, currency, user_id FROM budgets WHERE id = ?",
            ("bud-victim",),
        ).fetchone()
        assert row["label"] == "Lisbon Food"
        assert row["amount"] == 300
        assert row["currency"] == "EUR"
        assert row["user_id"] == seed_user
