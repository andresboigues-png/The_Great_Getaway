"""P2 — Insights GRAPHS reconciliation. Findings-only; no source mutated.

For each seeded scenario, we (1) pull /api/data, (2) compute lib.insights(),
(3) re-derive EXACTLY what each chart plots (donut top-7+Other, the
time-proportional timeline points, the per-currency stacked bars), and
(4) assert the chart sums equal the card totals. Also probes edge cases the
render code must survive (all-undated, single point, far-apart dates).
"""
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("GG_AUDIT_BASE", "http://127.0.0.1:5202")
import lib

HOME = "EUR"  # test users default to EUR home currency


def parse_date_ms(d):
    # mirror Date.parse(`${d}T00:00:00Z`)
    import datetime
    try:
        dt = datetime.datetime.strptime(d, "%Y-%m-%d").replace(tzinfo=datetime.timezone.utc)
        return dt.timestamp() * 1000.0
    except ValueError:
        return None


def donut(cat_totals, top_n=7):
    """Mirror the pieData/pieLabels build: top-7 + Other."""
    srt = sorted(cat_totals.items(), key=lambda kv: kv[1], reverse=True)
    slices = [{"cat": c, "v": v} for c, v in srt[:top_n]]
    rest = srt[top_n:]
    if rest:
        slices.append({"cat": "__OTHER__", "v": sum(v for _, v in rest)})
    return slices


def timeline_points(date_totals):
    """Mirror the timeline: only ISO dates, {x:ms,y}, sorted, drop non-finite x."""
    sorted_dates = sorted(date_totals.keys())  # JS sorts strings; unknown bucket sorts too
    pts = []
    for d in sorted_dates:
        x = parse_date_ms(d)
        if x is not None:
            pts.append({"x": x, "y": date_totals[d]})
    return pts


def currency_stacked(cur_date_totals, cur_codes):
    """Mirror the stacked bars: union of dates, each currency a dataset."""
    all_dates = sorted({d for c in cur_codes for d in cur_date_totals.get(c, {})})
    datasets = {c: [cur_date_totals.get(c, {}).get(d, 0) for d in all_dates] for c in cur_codes}
    return all_dates, datasets


def reconcile(name, expenses, cache=None, cpi=None, rates=None):
    rates = rates or lib.fx_rates()
    cache = cache if cache is not None else {}
    cpi = cpi if cpi is not None else {}
    R = lib.insights(expenses, HOME, "at_trip", cache, rates, cpi)
    out = [f"\n=== {name} (count={R['count']}, total={R['total']:.4f}) ==="]

    # 1) timeline Σy == total MINUS undated
    pts = timeline_points(R["by_date"])
    sum_pts = sum(p["y"] for p in pts)
    undated = R["by_date"].get("__UNK__", 0)
    out.append(f"  timeline: {len(pts)} pts, Σy={sum_pts:.4f}  (total-undated={R['total']-undated:.4f})  undated_dropped={undated:.4f}")
    if not lib.approx(sum_pts, R["total"] - undated):
        out.append(f"  !! TIMELINE MISMATCH: Σy {sum_pts} != total-undated {R['total']-undated}")

    # 2) donut Σslices == total
    d = donut(R["by_cat"])
    sum_d = sum(s["v"] for s in d)
    out.append(f"  donut: {len(d)} slices (incl Other={'yes' if any(s['cat']=='__OTHER__' for s in d) else 'no'}), Σ={sum_d:.4f}")
    if not lib.approx(sum_d, R["total"]):
        out.append(f"  !! DONUT MISMATCH: Σ {sum_d} != total {R['total']}")
    # distinct categories that fed the donut
    out.append(f"     distinct cats={len(R['by_cat'])}")

    # 3) per-currency stacked Σ == total
    cur_date = {}
    for e in expenses:
        if e.get("isSettlement"):
            continue
        cur = (e.get("currency") or "EUR").upper()
        dd = e.get("date") or "__UNK__"
        # use the SAME per-expense displayValue lib used
    # rebuild currencyDateTotals exactly like the component (home-equiv per date per cur)
    inf = lib.make_inflation_factor(cpi)
    for e in expenses:
        if e.get("isSettlement"):
            continue
        v = lib.display_value(e, HOME, "at_trip", cache, rates, inf, None)
        cur = (e.get("currency") or "EUR").upper()
        dd = e.get("date") or "__UNK__"
        cur_date.setdefault(cur, {})
        cur_date[cur][dd] = cur_date[cur].get(dd, 0) + v
    cur_codes = sorted(cur_date.keys())
    all_dates, datasets = currency_stacked(cur_date, cur_codes)
    sum_stack = sum(sum(v) for v in datasets.values())
    out.append(f"  cur-stacked: {len(cur_codes)} cur, {len(all_dates)} date-cols, Σ={sum_stack:.4f}  (multi={len(cur_codes)>=2})")
    if not lib.approx(sum_stack, R["total"]):
        out.append(f"  !! CUR-STACK MISMATCH: Σ {sum_stack} != total {R['total']}")
    # NOTE the currency stacked bars use a CATEGORY x-axis (labels), unlike the
    # main timeline's numeric axis — does it keep the undated bucket? check:
    if "__UNK__" in all_dates:
        out.append(f"     NB: currency-stacked KEEPS undated col '__UNK__' (main timeline DROPS it) -> visual inconsistency")

    # 4) by-spender / by-country sums
    out.append(f"  by_spender Σ={sum(R['by_spender'].values()):.4f}  by_country Σ={sum(R['by_country'].values()):.4f} (countries={len(R['by_country'])})")

    # 5) far-apart year label check
    iso_keys = [k for k in R["by_date"] if re.match(r"^\d{4}-\d{2}-\d{2}$", k)]
    yrs = {int(k[:4]) for k in iso_keys}
    if len(yrs) > 1:
        out.append(f"  includeYear=TRUE (years {min(yrs)}..{max(yrs)})")
    return "\n".join(out), R


# ── Scenarios ───────────────────────────────────────────────────────────────
def seed_trip(tok, name):
    tr = {"id": f"t-{name}-{int(time.time()*1000)%100000}", "name": name, "currency": "EUR",
          "members": ["Alice", "Bob"], "startDate": "2010-01-01", "endDate": "2026-12-31"}
    _, st = lib.create_trip(tok, tr)
    assert st in (200, 201), f"trip create {st}"
    return tr["id"]


def E(tid, **kw):
    base = {"id": f"e-{int(time.time()*1e6)%10**9}-{kw.get('label','x')}", "tripId": tid,
            "who": "Alice", "categoryId": "food", "label": "x", "value": 10.0,
            "currency": "EUR", "date": "2024-06-01"}
    base.update(kw)
    return base


def main():
    tok, user = lib.auth("test-p2-graphs", "P2")
    results = []

    # (a) single expense
    t1 = seed_trip(tok, "a-single")
    exps = [E(t1, label="solo", value=42.0, categoryId="food", date="2024-06-01")]
    for e in exps:
        lib.add_expense(tok, e)
    txt, _ = reconcile("(a) single expense", exps)
    results.append(txt)

    # (b) all-undated expenses
    t2 = seed_trip(tok, "b-undated")
    exps = [E(t2, label=f"u{i}", value=10.0 + i, categoryId="food", date="") for i in range(3)]
    for e in exps:
        lib.add_expense(tok, e)
    txt, R = reconcile("(b) all undated", exps)
    results.append(txt)
    results.append(f"     -> timeline pts={len(timeline_points(R['by_date']))} (EXPECT 0 -> empty chart). donut Σ={sum(s['v'] for s in donut(R['by_cat'])):.2f} (should still equal total {R['total']:.2f})")

    # (c) 1 currency (no breakdown)
    t3 = seed_trip(tok, "c-1cur")
    exps = [E(t3, label=f"c{i}", value=20.0, currency="EUR", date=f"2024-06-0{i+1}") for i in range(3)]
    for e in exps:
        lib.add_expense(tok, e)
    txt, R = reconcile("(c) single currency", exps)
    results.append(txt)

    # (d) 10+ categories (Other bucket)
    t4 = seed_trip(tok, "d-manycat")
    cats = ["food", "transport", "lodging", "activities", "shopping", "groceries",
            "drinks", "fuel", "tickets", "gifts", "misc", "fees"]  # 12 cats
    exps = [E(t4, label=c, value=float(i + 1) * 5, categoryId=c, date="2024-06-01") for i, c in enumerate(cats)]
    for e in exps:
        lib.add_expense(tok, e)
    txt, R = reconcile("(d) 12 categories", exps)
    d = donut(R["by_cat"])
    other = [s for s in d if s["cat"] == "__OTHER__"]
    top7_sum = sum(s["v"] for s in d if s["cat"] != "__OTHER__")
    results.append(txt)
    results.append(f"     -> donut top7 + Other = {len(d)} slices; Other={other[0]['v']:.2f} (= Σ of {len(cats)-7} smallest). top7Σ+Other={top7_sum + (other[0]['v'] if other else 0):.2f} vs total {R['total']:.2f}")

    # (e) many expenses SAME date (stacking on one column)
    t5 = seed_trip(tok, "e-sameday")
    exps = [E(t5, label=f"s{i}", value=15.0, categoryId=["food", "transport", "lodging"][i % 3], date="2024-06-01") for i in range(9)]
    for e in exps:
        lib.add_expense(tok, e)
    txt, R = reconcile("(e) 9 same-date expenses", exps)
    results.append(txt)
    results.append(f"     -> timeline pts={len(timeline_points(R['by_date']))} (EXPECT 1; all collapse to one date). y={timeline_points(R['by_date'])[0]['y']:.2f} vs total {R['total']:.2f}")

    # (f) far-apart dates 2010 vs 2026
    t6 = seed_trip(tok, "f-farapart")
    exps = [E(t6, label="old", value=100.0, categoryId="food", date="2010-03-15"),
            E(t6, label="new", value=200.0, categoryId="food", date="2026-03-15")]
    for e in exps:
        lib.add_expense(tok, e)
    txt, R = reconcile("(f) far-apart 2010 vs 2026", exps)
    pts = timeline_points(R["by_date"])
    results.append(txt)
    if len(pts) == 2:
        gap_ms = pts[1]["x"] - pts[0]["x"]
        results.append(f"     -> 2 pts spaced {gap_ms/1000/86400/365.25:.1f} yrs apart on numeric axis (proportional=GOOD). includeYear should be TRUE")

    # (g) mix: multi-currency, multi-country, multi-date, undated, many cats
    t7 = seed_trip(tok, "g-mix")
    exps = [
        E(t7, label="m1", value=50.0, currency="EUR", categoryId="food", country="Spain", date="2024-06-01", who="Alice"),
        E(t7, label="m2", value=80.0, currency="USD", categoryId="transport", country="USA", date="2024-06-02", who="Bob"),
        E(t7, label="m3", value=120.0, currency="GBP", categoryId="lodging", country="UK", date="2024-06-02", who="Alice"),
        E(t7, label="m4", value=30.0, currency="USD", categoryId="food", country="USA", date="2024-06-03", who="Bob"),
        E(t7, label="m5", value=15.0, currency="EUR", categoryId="shopping", country="Spain", date="", who="Alice"),  # undated
    ]
    for e in exps:
        lib.add_expense(tok, e)
    dates = sorted({e["date"] for e in exps if e["date"]})
    cache = lib.frankfurter_rate_cache(dates)
    txt, R = reconcile("(g) mix multi-cur/country/undated", exps, cache=cache)
    results.append(txt)

    print("\n".join(results))


if __name__ == "__main__":
    main()
