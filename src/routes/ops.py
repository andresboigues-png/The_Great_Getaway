"""Operational endpoints — liveness probe + CSP violation sink.

MK1 Wave G (T2-1): extracted verbatim from main.py. /healthz is the
uptime monitor's probe (R9-F4); /api/csp-report is the browser's CSP
violation sink (R12-B1, CSRF-exempt via the security middleware's
exempt list — matched by PATH, so the blueprint move changes nothing).
"""

from flask import Blueprint, jsonify, request

from database import get_db
from extensions import limiter
from observability import resolve_release

bp = Blueprint("ops", __name__)


@bp.route("/healthz")
@limiter.limit("60/minute")
def healthz():
    """R9-F4: liveness + readiness probe for uptime monitors.
    Returns 200 + a small JSON envelope when the app is alive and
    the DB responds to a trivial SELECT. Returns 503 if the DB
    ping fails — useful for monitors to alert on "WSGI is up but
    something downstream is broken" (e.g. PA filesystem hiccup,
    alembic migration mid-flight, sqlite locked by a long write).

    No auth — this endpoint is intentionally public so external
    monitors (UptimeRobot, Better Uptime, Pingdom, etc.) can poll
    without holding a session token. Response carries NO sensitive
    info: just status + release SHA (already public via Sentry
    breadcrumbs in production errors) + alembic head (already
    public via the migrations dir in the repo). No user counts,
    no env vars, no path info.

    Rate-limited to 60/min/IP so a misconfigured monitor (or a
    bored actor) can't hammer it into a writer-lock contention
    storm. UptimeRobot's free tier polls every 5 min anyway.

    Operator note: alert on (status != 'ok') OR (HTTP != 200) —
    don't alert on 'release' or 'alembicHead' value changes
    (those flap on every deploy + may be missing in some
    environments).
    """

    release = resolve_release() or "unknown"
    # DB ping — cheapest query that exercises the connection +
    # confirms the FD is real (not a stale PA worker socket).
    db_ok = False
    write_ok = False
    alembic_head = None
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
            # Pull the current alembic revision (best-effort —
            # absent on a pre-migrations DB, which is also valid).
            try:
                cursor.execute("SELECT version_num FROM alembic_version LIMIT 1")
                row = cursor.fetchone()
                alembic_head = row["version_num"] if row else None
            except Exception:
                pass
            db_ok = True
    except Exception as e:
        # Don't leak the exception text — could include a path or
        # connection string fragment. Log it for operator triage.
        from observability import get_logger

        get_logger("gg.health").warning("healthz db ping failed: %s", e)

    # R12-B1: write-capability probe. A SELECT-only ping returns 200
    # even when the DB is READ-ONLY (disk full, read-only mount — PA's
    # classic failure mode), so every POST 500s while uptime monitoring
    # thinks we're healthy. `BEGIN IMMEDIATE` forces SQLite to acquire
    # the RESERVED write lock immediately; on a read-only DB it raises
    # ("attempt to write a readonly database" / "disk I/O error").
    # ROLLBACK releases without persisting anything — no data mutated,
    # no schema needed, no journal churn. We use a dedicated autocommit
    # connection (isolation_level=None) so Python's sqlite3 doesn't
    # auto-wrap our explicit BEGIN in its own transaction.
    if db_ok:
        import sqlite3 as _sqlite3

        from database import BUSY_TIMEOUT_MS, _db_path

        _probe = None
        try:
            _probe = _sqlite3.connect(_db_path(), isolation_level=None)
            _probe.execute(f"PRAGMA busy_timeout={BUSY_TIMEOUT_MS}")
            _probe.execute("BEGIN IMMEDIATE")
            _probe.execute("ROLLBACK")
            write_ok = True
        except Exception as e:
            from observability import get_logger

            get_logger("gg.health").warning(
                "healthz write probe failed (DB may be read-only): %s", e
            )
        finally:
            if _probe is not None:
                try:
                    _probe.close()
                except Exception:
                    pass

    healthy = db_ok and write_ok
    payload = {
        "status": "ok" if healthy else "degraded",
        "release": release,
        "alembicHead": alembic_head,
        # Expose both legs so a monitor can tell "DB unreachable" from
        # "DB reachable but read-only".
        "dbRead": db_ok,
        "dbWrite": write_ok,
    }
    return jsonify(payload), (200 if healthy else 503)


@bp.route("/api/csp-report", methods=["POST"])
@limiter.limit("30/minute")
def csp_report():
    """R12-B1: CSP violation sink. Browsers POST a JSON body
    (`application/csp-report` or `application/reports+json`) here when
    a directive blocks something. We log it as a structured WARNING so
    a blocked script / XSS attempt / shifted-CDN url surfaces in the
    operator log + Sentry instead of failing silently.

    Defensive:
    - Bounded body read (CSP reports are tiny; reject anything large to
      avoid a log-spam DoS via a crafted oversized report).
    - 30/min limit caps a misbehaving / malicious client hammering it.
    - Always 204 (no content) regardless — the browser doesn't care
      about the response, and we never want this endpoint to 500 and
      pollute the 5xx rate.
    """
    try:
        raw = request.get_data(cache=False, as_text=True) or ""
        if len(raw) > 4096:
            raw = raw[:4096] + "…(truncated)"
        from observability import get_logger

        get_logger("gg.csp").warning("CSP violation report: %s", raw)
    except Exception:
        # Never let the report sink itself error — it'd inflate the
        # 5xx rate the CSP report was supposed to help us watch.
        pass
    return ("", 204)
