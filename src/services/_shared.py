"""Shared result type + helpers for the entity write services."""

from dataclasses import dataclass


@dataclass
class UpsertResult:
    """Outcome the route layer maps to HTTP (strict) or ignores (bulk).

    ok        write applied (or legitimately no-op'd on a tombstone).
    skipped   bulk-contract silent skip (validation/authz/stale/collision).
    error/status/extra
              strict-path failure: the route returns
              jsonify({"error": error, **extra}), status.
    euro_value / updated_at
              per-row response payload where the entity needs it
              (expenses echo the frozen euro_value — audit C2; every
              strict path echoes updated_at to close the
              read-modify-write concurrency cycle).
    """

    ok: bool
    skipped: bool = False
    error: str | None = None
    status: int | None = None
    extra: dict | None = None
    euro_value: float | None = None
    updated_at: str | None = None


def fail(strict: bool, error: str, status: int, **extra) -> UpsertResult:
    """Strict → an error result the route serialises; bulk → silent skip."""
    if strict:
        return UpsertResult(ok=False, error=error, status=status, extra=extra or None)
    return UpsertResult(ok=False, skipped=True)
