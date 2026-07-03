"""MK6 Wave 19 — GG_ALLOW_TEST_LOGIN blast-radius decoupling.

The flag must ONLY gate the `test:<id>` login shortcut. It must NOT also:
  * enable the ephemeral dev JWT-secret fallback (forgeable, per-worker),
  * drop the session cookie's Secure flag (plain-HTTP leak), or
  * count as a dev environment (skipping the CLIENT_ID_GOOGLE_AUTH boot
    guard + exposing dev-only routes).

Those dev relaxations now ride on FLASK_ENV / FLASK_DEBUG / pytest instead;
the Playwright harness sets FLASK_ENV=development explicitly. These tests
simulate a process where ONLY GG_ALLOW_TEST_LOGIN is set (pytest's own
marker cleared) to prove the flag no longer leaks into the security path.
"""

import pytest


def _only_test_login(monkeypatch):
    """Strip every real dev signal (including pytest's PYTEST_CURRENT_TEST)
    so dev-detection sees exactly one thing: GG_ALLOW_TEST_LOGIN=1."""
    monkeypatch.delenv("FLASK_ENV", raising=False)
    monkeypatch.delenv("FLASK_DEBUG", raising=False)
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.delenv("GG_JWT_SECRET", raising=False)
    monkeypatch.setenv("GG_ALLOW_TEST_LOGIN", "1")


def test_test_login_flag_does_not_enable_dev_jwt_fallback(monkeypatch):
    import auth
    _only_test_login(monkeypatch)
    # No GG_JWT_SECRET + not a real dev env → must refuse (raise), NOT
    # silently mint an ephemeral per-worker secret.
    with pytest.raises(RuntimeError):
        auth._secret()


def test_test_login_flag_does_not_drop_cookie_secure(monkeypatch):
    import auth
    _only_test_login(monkeypatch)
    assert auth._cookie_secure_flag() is True


def test_test_login_flag_is_not_dev_env(monkeypatch):
    import main
    _only_test_login(monkeypatch)
    assert main._is_dev_env() is False


def test_flask_env_development_still_selects_dev(monkeypatch):
    """The intended dev/e2e path (FLASK_ENV=development) must still select
    dev behaviour after the decoupling — otherwise Playwright's server
    wouldn't boot without GG_JWT_SECRET / CLIENT_ID_GOOGLE_AUTH."""
    import auth
    import main
    monkeypatch.delenv("FLASK_DEBUG", raising=False)
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.delenv("GG_JWT_SECRET", raising=False)
    monkeypatch.delenv("GG_ALLOW_TEST_LOGIN", raising=False)
    monkeypatch.setenv("FLASK_ENV", "development")
    assert main._is_dev_env() is True
    # dev → ephemeral fallback secret, no raise.
    assert isinstance(auth._secret(), str)
