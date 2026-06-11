"""Invariant checks + distributions for the PV scale audit. Reads
scale_results.json (produced by pv_scale_main.py). Findings-only.

Run: ./.venv/bin/python3 scratch/audit_pv_scale/pv_scale_check.py
"""
import json
import math
import os
import statistics

HERE = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(HERE, "scale_results.json")))

NORMAL = {"EUR", "USD", "GBP", "JPY", "CHF", "CAD", "AUD", "SEK", "NOK",
          "DKK", "CNY", "SGD", "HKD", "NZD"}


def bad(x):
    return (x is None) or (isinstance(x, float) and (math.isnan(x) or math.isinf(x)))


def check(rows, home):
    print("\n" + "=" * 80)
    print(f"  HOME = {home}   ({len(rows)} expenses)")
    print("=" * 80)

    # [1] NaN/Inf/negative
    nan = [(r["id"], r["currency"], r["year"], k) for r in rows
           for k in ("spent", "worth", "factor") if bad(r[k])]
    neg = [(r["id"], r["currency"], r["year"], k, r[k]) for r in rows
           for k in ("spent", "worth") if not bad(r[k]) and r[k] < 0]
    print(f"[1] NaN/Inf/None: {len(nan)}   negative: {len(neg)}")
    for x in (nan + neg)[:10]:
        print("     ", x)

    # [2] reconciliation
    ts = sum(r["spent"] for r in rows)
    tw = sum(r["worth"] for r in rows)
    cs = cw = ys = yw = 0.0
    bc_s, bc_w, by_s, by_w = {}, {}, {}, {}
    for r in rows:
        bc_s[r["currency"]] = bc_s.get(r["currency"], 0) + r["spent"]
        bc_w[r["currency"]] = bc_w.get(r["currency"], 0) + r["worth"]
        by_s[r["year"]] = by_s.get(r["year"], 0) + r["spent"]
        by_w[r["year"]] = by_w.get(r["year"], 0) + r["worth"]
    res = {
        "cur_spent": abs(sum(bc_s.values()) - ts),
        "cur_worth": abs(sum(bc_w.values()) - tw),
        "yr_spent": abs(sum(by_s.values()) - ts),
        "yr_worth": abs(sum(by_w.values()) - tw),
    }
    worst = max(res.values())
    print(f"[2] reconciliation max residual {worst:.2e} -> "
          f"{'PASS (<1e-6)' if worst < 1e-6 else 'FAIL'}  {res}")

    # [3] plausibility bands
    bands = {"<0.3": 0, "0.3-0.8": 0, "0.8-1.25": 0, "1.25-3": 0, "3-8": 0, ">8": 0}
    out = []
    for r in rows:
        if r["spent"] <= 0:
            continue
        ratio = r["worth"] / r["spent"]
        key = ("<0.3" if ratio < 0.3 else "0.3-0.8" if ratio < 0.8 else
               "0.8-1.25" if ratio < 1.25 else "1.25-3" if ratio < 3 else
               "3-8" if ratio <= 8 else ">8")
        bands[key] += 1
        if r["currency"] in NORMAL and (ratio < 0.3 or ratio > 8):
            out.append((r["id"], r["currency"], r["year"], round(r["spent"], 2),
                        round(r["worth"], 2), round(ratio, 2),
                        r["spent_source"], r["cur_source"], round(r["factor"], 3)))
    print(f"[3] worth/spent bands {bands}")
    print(f"    NORMAL-currency outliers <0.3x or >8x: {len(out)}")
    for o in out[:20]:
        print("     ", o)

    # [4] monotonicity of factor by year per currency
    cyf = {}
    for r in rows:
        cyf.setdefault(r["currency"], {}).setdefault(r["year"], r["factor"])
    inv = []
    for cur, ym in cyf.items():
        ys2 = sorted(ym)
        for a, b in zip(ys2, ys2[1:]):
            if ym[a] < ym[b] - 1e-9:
                inv.append((cur, a, round(ym[a], 4), b, round(ym[b], 4)))
    print(f"[4] factor inversions (older<newer): {len(inv)}")
    for x in inv[:20]:
        print("     ", x)

    # [5] per-currency factor min/med/max + source
    cf, csrc = {}, {}
    for r in rows:
        cf.setdefault(r["currency"], []).append(r["factor"])
        csrc.setdefault(r["currency"], set()).add(r["cur_source"])
    print("[5] per-currency inflation factor (today/expense-year):")
    print(f"      {'cur':>4} {'n':>4} {'min':>7} {'med':>7} {'max':>8}  src")
    table = []
    for cur in sorted(cf):
        fs = cf[cur]
        row = (cur, len(fs), min(fs), statistics.median(fs), max(fs), ",".join(sorted(csrc[cur])))
        table.append(row)
        print(f"      {cur:>4} {len(fs):>4} {min(fs):>7.3f} "
              f"{statistics.median(fs):>7.3f} {max(fs):>8.3f}  {','.join(sorted(csrc[cur]))}")

    # [6] headline
    pct = (tw / ts - 1) * 100 if ts else float("nan")
    print(f"[6] TOTAL spent {home} {ts:,.2f} | worth {home} {tw:,.2f} | "
          f"{pct:+.1f}% ({'pricier' if pct >= 0 else 'cheaper'})")
    smix, cmix = {}, {}
    for r in rows:
        smix[r["spent_source"]] = smix.get(r["spent_source"], 0) + 1
        cmix[r["cur_source"]] = cmix.get(r["cur_source"], 0) + 1
    print(f"    spent src {smix}")
    print(f"    worth src {cmix}")
    return {"nan": nan, "neg": neg, "recon": worst, "bands": bands,
            "outliers": out, "inversions": inv, "table": table,
            "totals": (ts, tw, pct), "bc_w": bc_w}


print(f"meta: {data['meta']}")
res_eur = check(data["EUR"], "EUR")
res_usd = check(data["USD"], "USD")

print("\n" + "#" * 80)
print("VERDICT INPUTS")
print("#" * 80)
print(f"EUR: nan={len(res_eur['nan'])} neg={len(res_eur['neg'])} recon={res_eur['recon']:.1e} "
      f"normal-outliers={len(res_eur['outliers'])} inversions={len(res_eur['inversions'])}")
print(f"USD: nan={len(res_usd['nan'])} neg={len(res_usd['neg'])} recon={res_usd['recon']:.1e} "
      f"normal-outliers={len(res_usd['outliers'])} inversions={len(res_usd['inversions'])}")
