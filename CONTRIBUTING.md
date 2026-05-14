# Contributing

Welcome. This doc is for anyone landing their first PR — the
team's own conventions plus the friction points worth knowing
about before you spend a session on something the review will
push back on.

Read [`ARCHITECTURE.md`](ARCHITECTURE.md) first if you haven't —
this file describes _how we work_, not _what's already built_.

---

## Branch naming

```
<type>/<short-slug>
```

Examples from the wild:

- `feat/follow-button-optimistic-ui`
- `refactor/extract-avatar-component`
- `fix/sqlite-lock-contention`
- `docs/rewrite-readme`
- `chore/prune-stale-chunks`

Names are short and grep-able, not full sentences. The PR title
carries the explanation.

`main` is the only long-lived branch. Feature branches merge via
PR (or, for solo founder commits, push directly with care). No
`develop` / staging branch — every push to main is the release
candidate.

---

## Commit messages

Use **Conventional Commits**:

```
<type>(<scope>): <imperative summary, ≤72 chars>

<optional body, wrapped to ~72 chars per line>

Co-Authored-By: <name> <email>   (when pair-programming)
```

Types in use:

- `feat` — user-visible new feature
- `fix` — user-visible bug fix
- `refactor` — internal restructure, no behaviour change
- `docs` — documentation only (no code)
- `chore` — tooling, dependencies, build artifacts
- `style` — CSS/visual changes, no logic
- `perf` — performance optimisation
- `revert` — reverts a previous commit (include the SHA in the body)

Scope is the area touched: page name (`home`, `feed`, `profile`),
domain (`auth`, `db`, `react`, `i18n`), or the feature
(`follow-button`). Keep it one word.

**Body is where the _why_ lives.** A reviewer or future-you reading
the log shouldn't have to read the diff to understand the change.
Recent examples from this repo's log:

```
fix(db): three-layer SQLite lock-contention hardening

The wave of 500s on /api/sync + /api/friends/add (PA prod,
2026-05-14) all trace back to `sqlite3.OperationalError:
database is locked` on conn.commit(). The 5-second busy_timeout
that FIXING_ROADMAP §1.4 installed handles short contention,
but on PA's networked filesystem sync_data's full-transaction
sweep — trips, archived trips + their expenses, …
```

The summary tells you _what_. The body tells you _why_. Tag
relevant `ROADMAP.md` / `FIXING_ROADMAP.md` section IDs (§0.3,
§1.4, etc.) so the change is grep-able from those docs.

---

## Pre-commit hook

`husky` + `lint-staged` runs automatically on every commit:

1. `eslint --fix` on staged TS/TSX
2. `prettier --write` on staged TS/TSX/JSON/MD/HTML/CSS
3. `tsc --noEmit` (typecheck)

If any of these fail, the commit is aborted. **Do NOT use
`--no-verify`** unless you've genuinely investigated why the hook
is failing and are sure bypassing it is correct. The hooks catch
real bugs about once a week.

If `prettier` rewrites your file mid-commit, the commit still
proceeds — the prettier-rewritten version is what lands. If you
care about exact formatting, run `npm run format` first.

---

## PR checklist

Before opening a PR:

- [ ] Branch is up to date with `main` (rebase, don't merge —
      avoids merge-commit noise in the linear history)
- [ ] `npm run typecheck` is clean
- [ ] `npm run lint` is clean
- [ ] `npm run build` succeeds
- [ ] `python3 -m pytest` is green (267 tests at the time of writing)
- [ ] If you touched a page's UI: ran the relevant Playwright
      visual spec locally (`npm run test:e2e:visual`) and
      confirmed the diff is intentional, or accepted new
      snapshots (`npm run test:e2e:visual:update`).
- [ ] If you added a new API endpoint or a new gate path: added
      pytest coverage (happy + auth-fail + ownership-fail
      minimum, per `tests/test_api.py` conventions)
- [ ] If you added a new user-facing string: added it to all four
      locale files (`en.ts`, `pt.ts`, `es.ts`, `fr.ts`). `tsc`
      will fail if you forget — the `Translations` type enforces
      key parity.
- [ ] If you touched a schema (added a column, changed a JSON
      shape): updated both the Zod schema in `schemas.ts` (front-
      end wire validation) AND wrote an Alembic migration (back-
      end). `init_db` is a sanity check, not the source of
      schema truth.

PR description template (no enforced format, but a useful one):

```markdown
## Summary

- bullet 1
- bullet 2

## Why

What problem this solves. Link to ROADMAP / FIXING_ROADMAP
section IDs if applicable.

## Test plan

- [ ] manual: <flow>
- [ ] automated: <which test suite covers this>

## Notes

Anything reviewers should know that isn't obvious from the diff.
```

---

## When CI green is enough

CI runs:

1. Lint + format check
2. `tsc --noEmit`
3. `vite build`
4. `python3 -m pytest` (full suite)
5. Playwright (functional + visual + axe-core a11y)

If all five are green, the PR can land for:

- Bug fixes that don't touch unfamiliar code paths
- Refactors with strong test coverage on the affected files
- Documentation
- Tooling / build changes
- Locale string updates
- Style tweaks that visual regression caught (or correctly
  passed through)

**Manual QA needed before merge** for:

- Anything touching Google Maps (CI doesn't have a Maps API key)
- Anything touching Gemini integration
- Anything touching the OAuth flow (CI runs a test-mode bypass —
  prod OAuth has to be exercised by hand)
- Visual changes that visual regression _didn't_ catch (e.g. dark
  mode in places we don't have snapshots for, mobile-only
  viewports we don't snapshot)
- New "happy path" flows that visual regression baselines were
  never made for
- Anything labelled "security" or touching `auth.py` /
  `permissions.ts`

**Visual regression** is the strongest CI signal — `toHaveScreenshot()`
against committed PNG baselines. If you intentionally change the
visual, accept the new snapshot in the same PR
(`npm run test:e2e:visual:update`).

---

## Adding a test

### A new API endpoint

Add to `tests/test_api.py`. One happy path + one auth-fail +
(for resource-scoped routes) one ownership-fail minimum. The
shape is:

```python
def test_my_endpoint_happy_path(client, auth_headers):
    res = client.post('/api/foo', json={...}, headers=auth_headers)
    assert res.status_code == 200
    data = res.get_json()
    assert data['status'] == 'success'

def test_my_endpoint_unauth(client):
    res = client.post('/api/foo', json={...})
    assert res.status_code == 401
```

Available fixtures (defined in `tests/conftest.py`):

- `client` — Flask test client backed by a temp SQLite file
- `seed_user` / `seed_other_user` — auto-seeded user rows
- `auth_headers` — `Bearer <jwt>` for `seed_user`
- `temp_db` — the path to the temp DB file (rarely needed
  directly)

### A new visual snapshot

```bash
# 1. Write a Playwright test that navigates to your new screen
#    and calls expect(page).toHaveScreenshot('my-feature.png').
# 2. Run with --update-snapshots to create the baseline:
npm run test:e2e:visual:update -- --grep "my-feature"
# 3. Manually inspect tests/e2e/visual.spec.js-snapshots/my-feature*.png
#    before committing — the auto-update accepts whatever
#    happens to render, which is exactly what you don't want
#    if there's a regression in the baseline render itself.
# 4. Commit the snapshot alongside your code change.
```

### A new internal helper

Add a focused unit test alongside the helper. `tests/test_database.py`
is the template — pure-Python tests of an exported helper, no
fixtures needed. Aim for happy path + edge cases (empty input,
boundary values, error class).

---

## Working with the legacy `STATE` + emit pattern

The frontend uses a hand-rolled mutable container (`STATE`) + an
event bus (`emit('state:changed')`) for global state. React
components subscribe via `useStore(s => s.x)` from
`react/store.ts`. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the
why.

**Rules of thumb:**

- Read STATE freely. Write STATE only through helper functions
  that also `emit('state:changed')` (otherwise subscribers don't
  re-render).
- For server deltas (single-resource upsert/delete), call the
  matching `api.ts` helper _after_ mutating STATE — the local
  update is optimistic, the server reconcile is best-effort.
  Most write paths are idempotent (`INSERT OR IGNORE`, `ON
CONFLICT UPDATE`).
- For module-level UI state that should survive
  navigate-away-and-back (selected tab, search filter, sort
  order), use the pattern in `pages/collections-mount/state.ts`
  or `pages/settings/tabState.ts` — small getter/setter module
    - optional `useSyncExternalStore` notification.
- **Don't add a global store library** (Redux, Zustand, MobX) for
  a single migration. The legacy pattern works; only swap if
  there's a concrete bug that needs slice-level subscriptions.

---

## Style + visual

- **Design tokens**: `:root` CSS variables in `frontend/static/js/css/index.css`. Re-use them. Inline gradients should be exceptional (intentional one-offs, not a substitute for the gradient tokens).
- **Dark mode**: every visual change must look right in both. We
  ship `data-theme="light|dark|system"` on `<html>`. Check both
  before pushing.
- **Mobile**: cooperative gesture handling on maps (1-finger
  scroll, 2-finger pan). Layouts collapse at 720px viewport.
  Test on a real device or DevTools mobile emulation.
- **Accessibility**: `role` + `aria-*` attributes on custom
  interactive controls. Run `npm run test:e2e:a11y` for the
  axe-core baseline.

---

## When to ask vs when to ship

This repo's founder has a strong preference for the "ship it, see
what breaks, fix what does" loop over up-front consensus seeking.
Ask before:

- Renaming a public API route (existing clients depend on it)
- Changing the database schema in a way that's not backward-
  compatible with already-deployed clients
- Touching `auth.py`, `permissions.ts`, or the JWT lifecycle
- Adding a new third-party dependency
- Anything that the existing `ROADMAP.md` / `FIXING_ROADMAP.md`
  has an open entry for — there might be context you don't yet
  have

For everything else: ship the smallest correct change, write the
test that proves it works, push.

---

## Helpful references

- [`README.md`](README.md) — quick start, available commands, project layout.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system overview (read this before code).
- [`VISION.md`](VISION.md) — product north star.
- [`ROADMAP.md`](ROADMAP.md) — phase-by-phase plan.
- [`FIXING_ROADMAP.md`](FIXING_ROADMAP.md) — security + bug tracker.
- [`SESSION_LOG.md`](SESSION_LOG.md) — per-session changelog. **Update at the end of every coding session.**
- [`A11Y_CHECKLIST.md`](A11Y_CHECKLIST.md) — manual accessibility audit.
