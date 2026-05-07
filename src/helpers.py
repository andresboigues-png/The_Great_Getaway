"""Shared route helpers.

Phase B4 lifts cross-route helpers out of `main.py` so blueprints can
import them without dragging the entire `main.py` import graph
(circular). Each helper here is small + pure (no app/db dependencies
beyond the get_db context manager).
"""

import json


def unwrap_legacy_plan_text(s):
    """Some legacy trip_days rows have morning/afternoon/evening stored
    as JSON-encoded strings (`'""'` for empty, `'"foo"'` for non-empty)
    because the old write path wrapped plain text with json.dumps.
    This detects that pattern and unwraps so the frontend sees clean
    text. Idempotent — passes through plain strings unchanged."""
    if not isinstance(s, str):
        return s or ''
    # Cheap shape check before json.loads — only attempt parse when
    # the string looks like a JSON-quoted scalar (starts AND ends
    # with double-quote). Avoids paying for the parse on the common
    # already-clean path.
    if len(s) >= 2 and s[0] == '"' and s[-1] == '"':
        try:
            parsed = json.loads(s)
            if isinstance(parsed, str):
                return parsed
        except Exception:
            pass
    return s
