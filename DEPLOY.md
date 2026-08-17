# Deploying

Two free Render services, described in [`render.yaml`](render.yaml): the API as a
web service, and the built front end as a static site.

The browser only ever calls `/api/*` on its own origin. In development the Vite
proxy forwards that to `localhost:8787`; in production the static site's rewrite
rule forwards it to the API. Nothing in the front end knows the API's address,
so there is no build-time URL to set and no CORS to configure.

## First deploy

1. In Render, **New → Blueprint**, point it at this repository. It reads
   `render.yaml` and creates both services.
2. On the **before-you-cut-api** service, set `YOUCAM_API_KEY` under
   Environment. This is the only secret, and it never leaves the server.
3. Check the API's real URL once it is live. Render appends a suffix if the
   name is taken (`before-you-cut-api-x7f2.onrender.com`). If yours differs from
   `https://before-you-cut-api.onrender.com`, update two places:
   - the `destination` of the `/api/*` rewrite in `render.yaml`
   - the repository variable `API_HEALTH_URL` (below)

## Keeping the API awake

A free web service sleeps after 15 minutes idle, and waking it takes the better
part of a minute — long enough that a first-time visitor assumes it is broken.
Two things prevent that:

- **[`.github/workflows/keep-awake.yml`](.github/workflows/keep-awake.yml)**
  pings `/api/health` every 10 minutes, so the service is already warm when
  someone arrives.
- **[`app/src/api/keepAwake.ts`](app/src/api/keepAwake.ts)** pings it every 10
  minutes from the browser while the page is open, so a demo in progress cannot
  go cold between the page loading and a try-on being run.

To point the workflow at a different API URL, set a repository variable (not a
secret) named `API_HEALTH_URL` under **Settings → Secrets and variables →
Actions → Variables**, e.g. `https://your-api.onrender.com/api/health`.

Things worth knowing about the schedule:

- GitHub runs scheduled workflows late when it is busy — hence the 10-minute
  interval against a 15-minute timeout, rather than cutting it fine.
- GitHub disables scheduled workflows on a repository with **60 days** of no
  commits. Any push re-enables them, as does **Run workflow** on the Actions
  tab.
- The workflow **stops pinging after 6 September 2026**, two days past the
  judging date, so it is not spending instance-hours on nothing afterwards. To
  move that, set a repository variable `KEEP_AWAKE_UNTIL` to a later `YYYY-MM-DD`.
  **Run workflow** ignores the window entirely.

### The free-hours budget

Render gives **750 free instance-hours a month, across the whole account**. A
single service kept awake around the clock uses 744 in a 31-day month. It fits,
with 6 hours to spare — but only if `before-you-cut-api` is the *only* free web
service on the account. A second one, even an idle old experiment, exceeds the
allowance and Render suspends free services for the rest of the billing month.

Before a judging window, delete or suspend every other free web service on the
account. Static sites do not draw on this budget.

The front end is a static site, so it never sleeps. Even if the API is cold, the
page itself loads instantly and only a try-on waits.

## What does not survive a restart

Render's free disk is ephemeral, and a sleeping service is a stopped one. Two
consequences:

- Rendered and tried-on images written to `server/storage/` are gone after a
  restart. Projects themselves live in the browser's IndexedDB and are fine —
  and **Export this project** writes a self-contained `.sampleroom.json` that is
  not affected either way.
- In-flight jobs are held in memory. A job that was still running when the
  service slept is lost; re-running it costs another unit.

A free instance kept awake around the clock uses roughly 730 of the 750 free
instance-hours in a month. That fits, but only for one service — the static site
does not draw on the same budget.
