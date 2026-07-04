"""config.py — the single documented registry of every environment variable.

MK1 Wave H (T2-3, `Best-in-class audit MK1.md` PY-2): 28 env vars were
read raw across ~10 modules with no one place answering "what can I set,
and what does it do?". This module IS that answer. Two rules:

  1. Accessors are LAZY (read at call time, never import time) unless a
     site explicitly needs a boot-time constant. Laziness is load-bearing:
     tests monkeypatch.setenv/delenv per test (Gemini key pool, dev
     detection, quotas), and the Gemini pool deliberately re-reads its
     keys per request so operators can rotate them with a worker reload.
  2. Modules MAY keep reading os.getenv directly where they already do —
     migrating every call site wholesale would churn test monkeypatch
     targets for zero behavior gain. NEW code should come here first,
     and shared logic (dev detection) must never be re-implemented inline
     again.

── Registry ────────────────────────────────────────────────────────────
Auth / security
  GG_JWT_SECRET            JWT signing key. REQUIRED in prod (auth.py
                           refuses to boot without it outside dev — §1.12);
                           dev/test fall back to an ephemeral per-process key.
  CLIENT_ID_GOOGLE_AUTH    Google OAuth client id. REQUIRED in prod
                           (main.py fail-fast boot guard, R12-B1).
  SECRET_KEY_GOOGLE_AUTH   Google OAuth client secret (login flow).
  GG_ALLOW_TEST_LOGIN      "1" unlocks the `test:<id>` login shortcut ONLY
                           (routes/auth.py). Deliberately NOT a dev signal
                           since MK6 Wave 19 — see is_dev_env().
  GG_TRUSTED_PROXIES       ProxyFix hop count (main.py; PA sits behind 1).

Dev / test detection (see is_dev_env below)
  FLASK_ENV                "development" selects dev behaviours.
  FLASK_DEBUG              "1" = dev + Flask debugger (main __main__ only).
  PYTEST_CURRENT_TEST      Set by pytest during tests — treated as dev.
  GG_E2E                   "1" disables rate limits for the Playwright
                           suite (main.py; separate flag by design so a
                           test-login leak can't also nuke limits).
  WERKZEUG_RUN_MAIN        Set by the dev reloader; maintenance.py uses it
                           to avoid double-starting the janitor thread.

Storage / database
  GG_DB_PATH               SQLite file path (database.py; alembic env.py
                           honours it too). PA pins it absolute.
  GG_UPLOAD_ROOT           Upload directory root (main.py; PA remaps it).
  GG_UPLOAD_QUOTA_BYTES    Per-user upload byte cap (media.py, default
                           500 MB — MK6 Wave 18).
  RATELIMIT_STORAGE_URI    Flask-Limiter backend (default memory://;
                           main.py warns when memory:// in prod, R12-B1).

Google APIs
  GOOGLE_MAPS_API_KEY      Browser Maps/Places key (also templated into
                           index.html) + PDF Static Maps fallback.
  GOOGLE_MAPS_SERVER_KEY   Server-side Places/Static-Maps key (preferred
                           over the browser key where present).
  GEMINI_API_KEY           Host-pool slot 1 for /api/generate_itinerary.
  GEMINI_API_KEY_2..6      Host-pool slots 2-6 (routes/integrations.py).
  GEMINI_KEY_COOLDOWN_SECONDS        Per-minute-quota cooldown (def 300).
  GEMINI_KEY_COOLDOWN_DAILY_SECONDS  Daily-quota cooldown (def 3600).

Observability
  SENTRY_DSN               Opt-in Sentry; absent/empty = logging only.
                           (tests/conftest.py blanks it — NOW-2.)
  SENTRY_ENV, SENTRY_RELEASE, GG_RELEASE,
  SENTRY_TRACES_SAMPLE_RATE, SENTRY_PROFILES_SAMPLE_RATE
                           Sentry tuning (observability.py). GG_RELEASE /
                           SENTRY_RELEASE default to the git SHA.
  LOG_LEVEL                Root logger level (observability.py, def INFO).

Misc
  GG_PORT                  Dev-server port (main __main__, def 5001; the
                           Playwright suite runs isolated on 5010).
  GG_DISABLE_ACHIEVEMENT_THROTTLE  "1" disables the achievements sweep
                           throttle (achievements.py; test/dev aid).
"""

import os


def is_dev_env() -> bool:
    """THE canonical dev/test detection — true iff FLASK_ENV=development,
    FLASK_DEBUG=1, or running under pytest.

    This exact triple was previously re-implemented inline in three
    places (main._is_dev_env, auth._secret, auth._cookie_secure_flag) —
    the same sibling-drift disease the write paths had. MK6 Wave 19's
    contract is preserved: GG_ALLOW_TEST_LOGIN is deliberately NOT part
    of this set (it only unlocks the test-login route), and the
    Playwright harness sets FLASK_ENV=development explicitly.

    Lazy on purpose: tests flip these vars per-test via monkeypatch.
    """
    return (
        os.getenv("FLASK_ENV") == "development"
        or os.getenv("FLASK_DEBUG") == "1"
        or os.getenv("PYTEST_CURRENT_TEST") is not None
    )
