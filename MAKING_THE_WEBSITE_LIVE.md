# Making The Website Live

How to deploy this app for free, ranked by fit. Captured 2026-05-06.

The app's shape: Flask backend, SQLite file as DB, Google OAuth + JWT
sessions, outbound HTTPS calls to Google Places / Gemini / Frankfurter.
Two things drive the host pick: **the SQLite file must persist across
deploys** (otherwise every push wipes user data) and **outbound HTTPS
must reach Google's domains** (auth + maps + AI all break otherwise).

---

## 1. Recommended: Fly.io (SEE IONOS NOW)

Best fit for this app. Free tier specifics:

- 3 shared-CPU VMs (more than enough)
- **3 GB persistent volume** — SQLite file lives here, survives deploys
- No automatic sleep — first visitor doesn't wait for a cold start
- Outbound HTTPS unrestricted

### Steps (rough)

1. Sign up at [fly.io](https://fly.io), install the `flyctl` CLI
2. From the project root: `fly launch` — pick a region close to you
3. Create a persistent volume: `fly volumes create gg_data --size 1`
4. Mount it at `/data` in `fly.toml`
5. Set the DB path env var: backend already honors `GG_DB_PATH` (set
   it to `/data/travel_planner.db` so SQLite writes to the volume)
6. Set the production secrets via `fly secrets set`:
    - `GG_JWT_SECRET=<32+ char random hex>` — generate with
      `python3 -c "import secrets; print(secrets.token_hex(32))"`
    - `CLIENT_ID_GOOGLE_AUTH=<your Google OAuth client ID>`
    - `GOOGLE_MAPS_API_KEY=<your Google Maps key>`
    - `GEMINI_API_KEY=<your Gemini key>` (optional)
    - `OPENAI_API_KEY=<your key>` (optional)
7. `fly deploy` and watch logs. App lives at `your-app.fly.dev`.

### Pitfalls to know about

- The `/static/uploads` folder must also be on the volume (otherwise
  uploaded photos vanish on next deploy). Symlink it from `/data/uploads`
  or change `UPLOAD_FOLDER` in `src/main.py` to point at the volume.
- After deploying, run `alembic stamp head` once on the live DB
  (or have init_db do its CREATE-IF-NOT-EXISTS pass on first boot —
  it does, so this is optional unless you start using migrations).
- Add the Fly URL to Google OAuth's "Authorized JavaScript origins"
  AND "Authorized redirect URIs" or sign-in will fail with a redirect
  mismatch error.

**Estimated time from zero to live**: ~1 hour.

---

## 2. Alternative: Render.com

Simpler UX, auto-deploys from a GitHub push. The catch is data
persistence on the free tier.

- **Free tier sleeps** after 15 min idle (~30s cold start for the
  next visitor)
- **Free disk doesn't persist** between deploys — SQLite would reset
  every push, which is unacceptable for real use
- Free tier offers a **free Postgres database for 90 days** — to use
  Render free in practice you'd swap SQLite for Postgres

If you take this path: the existing code is structured around
`get_db()` returning a `sqlite3.Connection`, so a Postgres switch
isn't a one-liner. You'd swap to `psycopg2` + adjust the SQL flavor
(SQLite's `INSERT ... ON CONFLICT DO UPDATE` translates to Postgres'
`INSERT ... ON CONFLICT (id) DO UPDATE`, mostly compatible). The
alembic migrations would need to be re-run against the new DB.

**Suitable if**: you want GitHub auto-deploy convenience and don't
mind migrating off SQLite eventually.

---

## 3. Alternative: PythonAnywhere

Built for Flask. Free tier has persistent storage so SQLite works
directly without a volume mount. Easiest deploy of the three.

- **Network restriction**: free tier outbound HTTPS is limited to an
  allowlist. Google's APIs are usually on the allowlist, but verify
  before committing — this app calls:
    - `accounts.google.com` (sign-in)
    - `oauth2.googleapis.com` (token exchange)
    - `generativelanguage.googleapis.com` (Gemini)
    - `maps.googleapis.com` (Maps API loaded in the browser, less
      relevant here)
    - `api.frankfurter.dev` (currency rates; was `api.frankfurter.app`,
      which now 301-redirects to `.dev/v1`)
    - `api.worldbank.org` (annual CPI for the Insights inflation calc)

If any of those are NOT allowlisted, the relevant feature breaks. The
fix is upgrading to the paid tier.

**Suitable if**: you want zero-fuss Flask deployment and you've
confirmed all outbound domains are allowed.

---

## Pre-flight checklist (any host)

Before pointing real users at the deployed URL:

- [ ] **`GG_JWT_SECRET` is set** to a 32+ char random hex. Without
      this, the backend generates an ephemeral secret per process,
      so JWTs become invalid on every restart and everyone gets
      logged out.
- [ ] **Google OAuth redirect** updated to include the deployed
      domain (in [console.cloud.google.com](https://console.cloud.google.com)
      → APIs & Services → Credentials → your OAuth client).
- [ ] **Static upload folder is persistent** — the same disk where
      SQLite lives. Otherwise photos get wiped on deploy.
- [ ] **Rate limit storage**: in-memory by default, fine for one
      worker. If you scale to multiple workers, set
      `RATELIMIT_STORAGE_URI=redis://...` (Render and Fly both have
      free Redis options).
- [ ] **Vite bundle is built** before deploy: `npx vite build`
      generates `frontend/static/js/app.bundle.js`. Backend serves
      it directly. No build step on the server.
- [ ] **Test the auth flow on the deployed domain** with a fresh
      browser (not your dev cookies) to catch redirect-URI mistakes
      before real users do.

---

## Photo storage strategy

The app uploads photos via `/api/upload` (already auth-gated +
MIME/size-hardened). They land in `/static/uploads/` on the server's
filesystem. That works fine on day one but storage scales with photos
× users × trips, and on a free 3 GB volume you hit the cap around
~20-30 trips' worth of photos.

**Local-only photos (kept on the user's device, never uploaded) is
NOT the right answer for this app**, even though it's tempting from a
cost angle:

- Trip companions can't see each other's photos (multi-user is core)
- Photos vanish when browser data is cleared
- Doesn't sync between phone + laptop
- Collections / "memories" experience breaks the moment storage clears

**Recommended path:**

1. **Day one**: keep photos on the server volume. Simpler, no third-party
   dependency, works out of the box. Free Fly.io 3 GB is plenty for
   personal use until usage actually proves it isn't.
2. **When you near the cap (or earlier if you want)**: swap to a free
   external image host. The server stores URLs, photos live on the host's
   CDN. The app already stores URLs as strings everywhere — only
   `/api/upload` needs to change (~50 lines).

**Recommended host when the day comes**: **Cloudinary** free tier
(25 GB storage, 25 GB monthly bandwidth, automatic image optimization
and CDN delivery). Generous enough for years of personal use. The
migration shape:

- `/api/upload` reads the incoming file, posts it to Cloudinary's
  upload API with a signed request, returns the Cloudinary URL.
- Existing photos on `/static/uploads/` keep working — they're just
  serving from the Fly volume forever (or you migrate them too with a
  one-off script).

Alternatives if Cloudinary is the wrong fit:

- **Bunny.net Storage** — cheap, simple, generous free credits.
- **Backblaze B2** — 10 GB free, fits cold-storage style.
- **Cloudflare R2** — 10 GB free, no egress fees.

**Don't pre-migrate** — the existing `/api/upload` works. Make the
swap when you actually feel the volume getting tight. The decision is
captured here so future-you doesn't have to re-derive it.

---

## Domain + CDN (optional, free)

- **Cloudflare Pages**: not for the backend, but Cloudflare's free
  plan can sit in front of any host and give you a custom domain
    - free CDN caching for static assets. Worth it once usage grows.
- **Custom domain**: any host above lets you bring your own
  domain. Buy one anywhere (~$10/year), point its DNS at the host,
  add it to Google OAuth's redirect list.

---

## When the free tier stops being enough

Rough thresholds where each free option breaks:

- **Fly.io**: 3 GB volume holds tens of thousands of trips. Outgrowing
  free means either a $1.94/mo bigger volume or a paid VM (~$5/mo).
- **Render**: free Postgres expires after 90 days. After that, the
  cheapest paid Postgres is $7/mo.
- **PythonAnywhere**: free tier limits CPU seconds and outbound
  domains. Paid Hacker plan is $5/mo and removes both.

For a personal travel app used by you and a few friends, free Fly.io
is plausible to stay free indefinitely.
