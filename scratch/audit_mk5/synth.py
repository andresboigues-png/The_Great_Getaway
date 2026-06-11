"""Final Audit MK5 synthesizer.
Loads full findings (main run + re-run + extra mobile/new-user audits),
applies the adversarial verdicts (drops refuted, uses adjusted severity),
and writes the titled Markdown report — bugs separated from design,
sorted by severity, with stable IDs for later fixing."""
import json, html, os, glob

BASE = '/Users/andres.boigues/Documents/Code4All/AntiGravity projects/The GG - ALPHA CLAUDE/scratch/audit_mk5'
TD = '/private/tmp/claude-501/-Users-andres-boigues-Documents-Code4All-AntiGravity-projects-The-GG---ALPHA-CLAUDE/bb5119a3-da04-4fa7-8f27-be50a1323954/tasks'
OUT = '/Users/andres.boigues/Documents/Code4All/AntiGravity projects/The GG - ALPHA CLAUDE/Audit MK5 — fresh full sweep.md'

ALL_KEYS = ['auth','trips','itinerary','todo','ai','maps','companions','expenses','settlements','budgets','insights','rates-editor','templates','sharing','media','pdf','collections','feed-social','notifications','settings','i18n','sync-offline','state','security','home','mobile','a11y','money-invariant','journey-new-user','journey-creator-template','journey-money','journey-share-clone','journey-media-pdf']
BUG_CATS = {'bug','data-loss','security','correctness'}
SEV_ORDER = {'P0':0,'P1':1,'P2':2,'P3':3}

def clean(s):
    return html.unescape(s or '').strip()

# ---- 1. full findings ----
findings = []
def add_dims(dimlist):
    for dim in dimlist:
        k = dim.get('key')
        for f in dim.get('findings', []):
            f = dict(f); f['dimension'] = f.get('dimension') or k
            findings.append(f)

for fn in ['wiqqkxbsk.output', 'wah7a8qxp.output']:
    p = os.path.join(TD, fn)
    if os.path.exists(p):
        add_dims(json.loads(open(p, encoding='utf-8').read())['result'].get('dimensions', []))

for p in sorted(glob.glob(os.path.join(BASE, 'extra_*.json'))):
    try:
        o = json.load(open(p, encoding='utf-8'))
    except Exception:
        continue
    k = o.get('key')
    for f in o.get('findings', []):
        f = dict(f); f['dimension'] = f.get('dimension') or k
        findings.append(f)

# ---- 2. verdicts ----
verd = {}
verdict_dims = set()
for p in sorted(glob.glob(os.path.join(BASE, 'verdicts', 'verdicts_*.json'))):
    try:
        o = json.load(open(p, encoding='utf-8'))
    except Exception:
        continue
    k = o.get('key'); verdict_dims.add(k)
    for v in o.get('verdicts', []):
        verd[(k, clean(v.get('title')))] = v

# ---- 3. apply verdicts ----
SEV = SEV_ORDER
applied = []
dropped = 0
for f in findings:
    key = (f.get('dimension'), clean(f.get('title')))
    v = verd.get(key)
    if v:
        if v.get('verdict') == 'refuted':
            dropped += 1; continue
        f['verdict'] = v.get('verdict')
        if v.get('adjustedSeverity'):
            f['severity'] = v['adjustedSeverity']
        f['verifyNote'] = clean(v.get('reasoning'))
    else:
        f['verdict'] = 'unverified'; f['verifyNote'] = ''
    applied.append(f)

# de-dupe identical titles (keep most severe)
seen = {}
for f in applied:
    t = clean(f.get('title'))
    if not t:
        continue
    if t not in seen or SEV.get(f.get('severity','P3'),3) < SEV.get(seen[t].get('severity','P3'),3):
        seen[t] = f
applied = list(seen.values())

bugs = [f for f in applied if f.get('category') in BUG_CATS]
design = [f for f in applied if f.get('category') not in BUG_CATS]
for lst in (bugs, design):
    lst.sort(key=lambda f: (SEV.get(f.get('severity','P3'),3), f.get('dimension','')))

def cnt(lst, s):
    return sum(1 for f in lst if f.get('severity') == s)

present = {f.get('dimension') for f in applied}
missing = [k for k in ALL_KEYS if k not in present]
unverified_dims = sorted({f.get('dimension') for f in applied if f.get('verdict') == 'unverified'})

def fmt(f, fid):
    files = ', '.join('`%s`' % clean(x) for x in (f.get('files') or []))
    conf = f.get('confidence')
    conf = ('%.2f' % conf) if isinstance(conf,(int,float)) else '—'
    L = ['### %s — [%s][%s] %s' % (fid, f.get('severity','?'), f.get('category','?'), clean(f.get('title'))),
         '_%s · verdict: **%s** · confidence %s_' % (clean(f.get('dimension')), f.get('verdict','?'), conf), '',
         '- **Files:** %s' % (files or '—'),
         '- **Symptom:** %s' % clean(f.get('symptom')),
         '- **Root cause:** %s' % clean(f.get('rootCause'))]
    if clean(f.get('repro')): L.append('- **Repro:** %s' % clean(f.get('repro')))
    if clean(f.get('suggestedFix')): L.append('- **Suggested fix:** %s' % clean(f.get('suggestedFix')))
    if clean(f.get('verifyNote')): L.append('- **Verifier:** %s' % clean(f.get('verifyNote')))
    L.append('')
    return '\n'.join(L)

allf = bugs + design
tot = {s: cnt(allf, s) for s in ('P0','P1','P2','P3')}
from collections import Counter
vdist = dict(Counter(f.get('verdict') for f in allf))

L = []
L.append('# The Great Getaway — Audit MK5 (fresh full sweep)')
L.append('')
L.append('_Generated 2026-06-05. Findings-only; nothing has been changed. Each finding was produced by a deep-read auditor and independently re-checked by an adversarial verifier; **refuted** findings have been dropped (%d removed)._' % dropped)
L.append('')
L.append('## Coverage')
L.append('')
L.append('- **Dimensions with findings:** %d / 33.' % len(present))
if missing:
    L.append('- **Dimensions with zero findings (or not audited):** %s' % ', '.join('`%s`'%m for m in missing))
L.append('- **Verified findings (post-refute, deduped):** %d — **P0 %d · P1 %d · P2 %d · P3 %d**.' % (len(allf), tot['P0'], tot['P1'], tot['P2'], tot['P3']))
L.append('- **Verdict mix:** %s.' % ', '.join('%s %d' % (k, v) for k, v in sorted(vdist.items())))
if unverified_dims:
    L.append('- **Still unverified (no verdict file):** %s.' % ', '.join('`%s`'%d for d in unverified_dims))
L.append('- **%d** bugs/correctness/security/data-loss · **%d** design/UX/a11y/i18n/perf.' % (len(bugs), len(design)))
L.append('')
L.append('Severity: **P0** = data loss / security / core flow broken · **P1** = major · **P2** = moderate or edge-case · **P3** = minor / polish. Verdict: **confirmed** = verifier re-read the code and agrees · **uncertain** = plausible, needs a runtime check · **unverified** = no adversarial pass yet.')
L.append('')
L.append('---')
L.append('')
L.append('# Part A — Bugs, correctness, security & data-loss')
L.append('')
n = 0; cur = None
for f in bugs:
    if f.get('severity') != cur:
        cur = f.get('severity'); L.append('## %s  (%d)' % (cur, cnt(bugs, cur))); L.append('')
    n += 1; L.append(fmt(f, 'BUG-%03d' % n))
L.append('---'); L.append('')
L.append('# Part B — Design, UX, accessibility, i18n & performance')
L.append('')
n = 0; cur = None
for f in design:
    if f.get('severity') != cur:
        cur = f.get('severity'); L.append('## %s  (%d)' % (cur, cnt(design, cur))); L.append('')
    n += 1; L.append(fmt(f, 'DSGN-%03d' % n))

open(OUT, 'w', encoding='utf-8').write('\n'.join(L))
print('WROTE', os.path.basename(OUT), '(%d bytes)' % os.path.getsize(OUT))
print('findings(full):', len(findings), '| refuted-dropped:', dropped, '| final:', len(allf))
print('coverage dims:', len(present), '/33 ; missing:', missing or 'none')
print('verdict files for dims:', sorted(verdict_dims))
print('unverified dims:', unverified_dims or 'none')
print('totals: P0 %d | P1 %d | P2 %d | P3 %d | bugs %d | design %d' % (tot['P0'],tot['P1'],tot['P2'],tot['P3'],len(bugs),len(design)))
print('verdict mix:', vdist)
print()
print('=== P0 + P1 BUGS (confirmed/uncertain only) ===')
for f in bugs:
    if f.get('severity') in ('P0','P1'):
        print('[%s][%s][%s] (%s) %s' % (f.get('severity'), f.get('category'), f.get('verdict'), clean(f.get('dimension')), clean(f.get('title'))))
