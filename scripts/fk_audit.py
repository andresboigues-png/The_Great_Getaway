#!/usr/bin/env python3
"""scripts/fk_audit.py — read-only foreign-key orphan audit.

FIXING_ROADMAP §1.4 Phase 1.

SQLite ships with `PRAGMA foreign_keys=OFF` by default. Our migrations
declare FOREIGN KEY clauses on every relational table, but those
clauses are advisory until the PRAGMA is flipped on in get_db().
Until then, `INSERT INTO expenses VALUES('e1', 'trip-doesnt-exist',
...)` succeeds silently and we accrue orphan rows nobody notices
until a JOIN query crashes or hands back wrong data.

This script answers two questions before we commit to flipping FK
enforcement on:

  1. Does the live DB already contain orphan rows from years of
     off-FK writes?
  2. If yes, which classes? How many of each? What do they look
     like?

It is intentionally read-only — it opens the DB in `mode=ro` URI
form, never writes, and never changes session PRAGMAs. Safe to run
against any DB (dev, CI, a prod snapshot).

USAGE
    python3 scripts/fk_audit.py [--db PATH] [--json] [--samples N]

EXIT CODES
    0 — no orphans found; the DB is referentially clean.
    1 — at least one orphan found; see the report for per-class
        counts + sample rows.
    2 — script error (DB unreachable, schema missing the audited
        tables, SQLite refuses the URI, etc.).

ARCHITECTURE
    Relationships come from two sources:

      a) `PRAGMA foreign_key_list(<table>)` for every table in
         sqlite_master — this is the source of truth for what the
         schema CLAIMS. Each declared FK appears in the report
         tagged [declared].

      b) A small hardcoded IMPLICIT_FKS list below for relationships
         that exist logically but lack a declared FOREIGN KEY clause.
         Reason: some columns were added post-baseline via
         ALTER TABLE, and SQLite cannot add FK constraints to
         existing columns without a full table rebuild — they're
         scheduled to migrate to declared FKs in Phase 4. Tagged
         [implicit] in the report.

    Polymorphic columns (notifications.related_id, feed_likes /
    feed_bookmarks / feed_comments.event_id) are intentionally
    skipped. Their referent depends on a sibling column
    (notifications.type, feed event_id encoding), so a single-table
    orphan check would be wrong. Their integrity is enforced at the
    application layer; the audit lists them in a SKIPPED section
    so the operator knows we know.

NOTE on column-name interpolation
    Table + column names are interpolated into SQL via f-strings
    because sqlite3 doesn't parameterise identifiers. The values
    come from PRAGMA results (the DB itself reporting its schema)
    plus the IMPLICIT_FKS literal — never from user input — so
    injection is not a concern. We do a defensive identifier sanity
    check anyway (`_safe_ident`) in case a future schema
    introduces a quoted-identifier table name.
"""

import argparse
import json
import os
import re
import sqlite3
import sys
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from typing import Optional


# ── Implicit FK relationships ────────────────────────────────────────
# Columns that logically reference another table but lack a declared
# FOREIGN KEY clause in their CREATE TABLE. SQLite cannot add an FK
# to an existing column via ALTER, so retrofitting requires either
# a table rebuild (Phase 4) or a defacto enforcement at the
# application layer.
#
# Each entry: (child_table, child_col, parent_table, parent_col, nullable_ok, reason)
#   nullable_ok=True  → NULL values are valid (the relationship is
#                       optional) and don't count as orphans.
#   nullable_ok=False → NULL means orphan (column should never be
#                       NULL semantically).
IMPLICIT_FKS = [
    # budgets.trip_id is NULL for global / non-trip-scoped budgets.
    # When set, must reference an existing trip.
    (
        "budgets", "trip_id", "trips", "id", True,
        "no declared FK; trip_id is nullable (global budgets allowed)",
    ),
    # trip_members.invited_by is NULL for the owner's self-created
    # membership row (no inviter). When set, must reference a user.
    (
        "trip_members", "invited_by", "users", "id", True,
        "no declared FK; NULL for owner self-membership rows",
    ),
    # feed_posts.repost_of_post_id is NULL for original posts. When
    # set, must reference an existing post (self-reference within
    # the same table).
    (
        "feed_posts", "repost_of_post_id", "feed_posts", "id", True,
        "self-reference; NULL for original (non-repost) posts",
    ),
]


# ── Polymorphic columns — explicitly NOT audited ─────────────────────
# These columns reference an id whose target table depends on a
# sibling column. A single-table FK check would either flag false
# positives or miss real orphans depending on which sibling-value
# we pick. Listed for operator visibility.
POLYMORPHIC_COLUMNS = [
    (
        "notifications", "related_id",
        "target depends on notifications.type — can be a trip id, "
        "user id, feed event id, or NULL depending on the type",
    ),
    (
        "feed_likes", "event_id",
        "feed event id whose actual table varies by event-type prefix "
        "(post / action / achievement / etc.)",
    ),
    (
        "feed_bookmarks", "event_id",
        "same encoding as feed_likes.event_id",
    ),
    (
        "feed_comments", "event_id",
        "same encoding as feed_likes.event_id",
    ),
]


# Conservative identifier check — alphanumeric + underscore only.
# Every table / column name we care about matches this; anything else
# means something unusual happened (a quoted identifier in the schema)
# and we want a loud error rather than a silent SQL splice.
_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _safe_ident(name: str) -> str:
    if not _IDENT_RE.match(name):
        raise ValueError(f"unsafe SQL identifier: {name!r}")
    return name


@dataclass
class FkClass:
    """One foreign-key relationship + its orphan finding.

    `source` is "declared" (came from PRAGMA foreign_key_list) or
    "implicit" (came from the IMPLICIT_FKS list above).
    """
    child_table: str
    child_column: str
    parent_table: str
    parent_column: str
    source: str
    nullable_ok: bool
    orphan_count: int
    total_count: int
    samples: list[dict] = field(default_factory=list)
    note: Optional[str] = None  # for IMPLICIT_FKS reasoning


def _list_tables(cur) -> list[str]:
    """Real, app-managed tables — exclude SQLite internals + Alembic's
    own bookkeeping (`alembic_version`)."""
    cur.execute(
        "SELECT name FROM sqlite_master "
        "WHERE type='table' "
        "  AND name NOT LIKE 'sqlite_%' "
        "  AND name NOT LIKE 'alembic_%' "
        "ORDER BY name"
    )
    return [r[0] for r in cur.fetchall()]


def _table_exists(cur, table: str) -> bool:
    cur.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    )
    return cur.fetchone() is not None


def _column_is_notnull(cur, table: str, column: str) -> bool:
    """True if the column was declared NOT NULL (PRIMARY KEY also
    implies NOT NULL in SQLite). False otherwise — including the
    common case of a TEXT column with no NOT NULL constraint."""
    cur.execute(f"PRAGMA table_info({_safe_ident(table)})")
    for row in cur.fetchall():
        # PRAGMA table_info columns: cid, name, type, notnull, dflt_value, pk
        if row[1] == column:
            return bool(row[3]) or bool(row[5])  # notnull OR pk
    return False


def _primary_key_columns(cur, table: str) -> list[str]:
    cur.execute(f"PRAGMA table_info({_safe_ident(table)})")
    return [row[1] for row in cur.fetchall() if row[5]]


def _discover_declared_fks(cur, tables: list[str]) -> list[tuple]:
    """For each table, ask SQLite which FKs it has declared.

    `PRAGMA foreign_key_list(<t>)` columns:
      0: id           (FK group ordinal; multi-col FKs share id)
      1: seq          (column ordinal within the FK)
      2: table        (parent table name)
      3: from         (child column name)
      4: to           (parent column name; NULL if FK targets PK
                       without naming the column)
      5: on_update    (cascade behaviour, ignored here)
      6: on_delete    (cascade behaviour, ignored here)
      7: match        (match style, ignored)
    """
    out = []
    for table in tables:
        cur.execute(f"PRAGMA foreign_key_list({_safe_ident(table)})")
        rows = cur.fetchall()
        if not rows:
            continue
        for row in rows:
            parent_table = row[2]
            child_col = row[3]
            parent_col = row[4]
            # When `to` is NULL, the FK targets the parent's PK without
            # naming the column. Resolve to the actual PK column.
            if parent_col is None:
                pk = _primary_key_columns(cur, parent_table)
                parent_col = pk[0] if pk else "id"
            nullable_ok = not _column_is_notnull(cur, table, child_col)
            out.append((table, child_col, parent_table, parent_col, nullable_ok))
    return out


def _count_orphans(
    cur,
    child_table: str,
    child_col: str,
    parent_table: str,
    parent_col: str,
    nullable_ok: bool,
    samples: int,
) -> tuple[int, int, list[dict]]:
    """Count + sample orphans for one FK relationship.

    Definition of orphan:
      - child row exists
      - child_col is NOT NULL  (unless the column itself is allowed
        to be NULL — then NULL is fine and doesn't count)
      - no row in parent_table has parent_col = child_col

    Implementation:
      LEFT JOIN parent ON parent.parent_col = child.child_col
      WHERE child.child_col IS NOT NULL  -- when nullable_ok
        AND parent.parent_col IS NULL    -- the anti-join
    """
    ct = _safe_ident(child_table)
    cc = _safe_ident(child_col)
    pt = _safe_ident(parent_table)
    pc = _safe_ident(parent_col)

    cur.execute(f"SELECT COUNT(*) FROM {ct}")
    total = cur.fetchone()[0]

    null_filter = f"c.{cc} IS NOT NULL" if nullable_ok else "1=1"

    sql_count = (
        f"SELECT COUNT(*) FROM {ct} c "
        f"LEFT JOIN {pt} p ON p.{pc} = c.{cc} "
        f"WHERE {null_filter} AND p.{pc} IS NULL"
    )
    cur.execute(sql_count)
    orphan_count = cur.fetchone()[0]

    sample_rows: list[dict] = []
    if orphan_count > 0 and samples > 0:
        pk_cols = _primary_key_columns(cur, child_table)
        # Some tables have composite PKs (trip_members(trip_id,user_id)).
        # We expose all PK columns + the dangling value so the operator
        # can correlate against the live DB without ambiguity.
        select_cols = ", ".join(f"c.{_safe_ident(c)}" for c in pk_cols) if pk_cols else "rowid"
        sql_samples = (
            f"SELECT {select_cols}, c.{cc} AS dangling_value "
            f"FROM {ct} c "
            f"LEFT JOIN {pt} p ON p.{pc} = c.{cc} "
            f"WHERE {null_filter} AND p.{pc} IS NULL "
            f"LIMIT {int(samples)}"
        )
        cur.execute(sql_samples)
        rows = cur.fetchall()
        col_names = [d[0] for d in cur.description]
        sample_rows = [dict(zip(col_names, r)) for r in rows]

    return orphan_count, total, sample_rows


def audit(db_path: str, samples: int = 5) -> list[FkClass]:
    """Audit the DB at `db_path`. Returns one FkClass per checked
    relationship. Raises sqlite3.Error if the DB can't be opened or
    the schema is broken in a way that fails the orphan query."""
    uri = f"file:{db_path}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    try:
        cur = conn.cursor()
        tables = _list_tables(cur)
        declared = _discover_declared_fks(cur, tables)

        # Tag every declared FK + augment with the IMPLICIT_FKS list.
        # Implicit FKs skipped silently when either table is missing —
        # protects test DBs that have a partial schema.
        all_fks = []
        for (t, c, pt, pc, n) in declared:
            all_fks.append({
                "child_table": t,
                "child_column": c,
                "parent_table": pt,
                "parent_column": pc,
                "nullable_ok": n,
                "source": "declared",
                "note": None,
            })
        for (t, c, pt, pc, n, note) in IMPLICIT_FKS:
            if t not in tables or pt not in tables:
                continue
            all_fks.append({
                "child_table": t,
                "child_column": c,
                "parent_table": pt,
                "parent_column": pc,
                "nullable_ok": n,
                "source": "implicit",
                "note": note,
            })

        out: list[FkClass] = []
        for fk in all_fks:
            orphan_count, total, sample_rows = _count_orphans(
                cur,
                fk["child_table"], fk["child_column"],
                fk["parent_table"], fk["parent_column"],
                fk["nullable_ok"], samples,
            )
            out.append(FkClass(
                child_table=fk["child_table"],
                child_column=fk["child_column"],
                parent_table=fk["parent_table"],
                parent_column=fk["parent_column"],
                source=fk["source"],
                nullable_ok=fk["nullable_ok"],
                orphan_count=orphan_count,
                total_count=total,
                samples=sample_rows,
                note=fk["note"],
            ))
        return out
    finally:
        conn.close()


def render_report(classes: list[FkClass]) -> str:
    """Human-readable report. Grouped by parent table; orphans-first
    inside each group so problems pop without scrolling."""
    lines: list[str] = []
    lines.append("─" * 72)
    lines.append("FOREIGN-KEY AUDIT — FIXING_ROADMAP §1.4 Phase 1")
    lines.append("─" * 72)

    total_orphans = sum(c.orphan_count for c in classes)
    lines.append(
        f"{len(classes)} FK relationships checked · "
        f"{total_orphans} orphan row{'s' if total_orphans != 1 else ''} total"
    )
    lines.append("")

    by_parent: dict[str, list[FkClass]] = defaultdict(list)
    for cls in classes:
        by_parent[cls.parent_table].append(cls)

    for parent in sorted(by_parent):
        rows = sorted(
            by_parent[parent],
            key=lambda r: (-r.orphan_count, r.child_table, r.child_column),
        )
        lines.append(f"  → {parent}")
        for r in rows:
            status = (
                "✓ clean"
                if r.orphan_count == 0
                else f"⚠ {r.orphan_count} orphan{'s' if r.orphan_count != 1 else ''}"
            )
            nullable_tag = " (nullable)" if r.nullable_ok else ""
            source_tag = "" if r.source == "declared" else " [implicit]"
            ratio = f" of {r.total_count}"
            lines.append(
                f"    {r.child_table}.{r.child_column}{nullable_tag}{source_tag} "
                f"→ {r.parent_table}.{r.parent_column}: {status}{ratio}"
            )
            if r.note and r.orphan_count == 0:
                # Show implicit-FK reasoning even when clean — helps
                # the operator audit the audit list itself.
                lines.append(f"        note: {r.note}")
            if r.samples:
                for s in r.samples:
                    lines.append(f"        sample: {json.dumps(s, default=str)}")
        lines.append("")

    lines.append("─" * 72)
    lines.append("SKIPPED (polymorphic — referent depends on a sibling column):")
    for (t, c, why) in POLYMORPHIC_COLUMNS:
        lines.append(f"  · {t}.{c}")
        lines.append(f"      {why}")
    lines.append("─" * 72)

    return "\n".join(lines)


def main() -> None:
    p = argparse.ArgumentParser(
        description="Foreign-key orphan audit (read-only).",
    )
    p.add_argument(
        "--db",
        default=os.getenv("GG_DB_PATH", "travel_planner.db"),
        help="path to the SQLite DB (default: $GG_DB_PATH or travel_planner.db)",
    )
    p.add_argument(
        "--json",
        action="store_true",
        help="emit JSON instead of the human-readable report",
    )
    p.add_argument(
        "--samples",
        type=int,
        default=5,
        help="number of sample orphan rows to include per FK class (default 5)",
    )
    args = p.parse_args()

    if not os.path.exists(args.db):
        print(f"error: DB not found at {args.db}", file=sys.stderr)
        sys.exit(2)

    try:
        classes = audit(args.db, samples=args.samples)
    except sqlite3.Error as exc:
        print(f"error: SQLite failed: {exc}", file=sys.stderr)
        sys.exit(2)
    except ValueError as exc:
        # Identifier sanity check tripped — something is weird about
        # the schema. Bail loudly so the operator notices.
        print(f"error: schema check failed: {exc}", file=sys.stderr)
        sys.exit(2)

    if args.json:
        payload = {
            "db_path": args.db,
            "total_orphans": sum(c.orphan_count for c in classes),
            "classes": [asdict(c) for c in classes],
            "polymorphic_skipped": [
                {"table": t, "column": c, "reason": why}
                for (t, c, why) in POLYMORPHIC_COLUMNS
            ],
        }
        print(json.dumps(payload, indent=2, default=str))
    else:
        print(render_report(classes))

    sys.exit(1 if sum(c.orphan_count for c in classes) else 0)


if __name__ == "__main__":
    main()
