# UNCHAINED Status Page

Status page for `https://status.unchained.co.jp`.
Built with Astro + Cloudflare Pages Functions, backed by updown.io and Cloudflare KV.

## Overview

This project renders a 7-day status timeline per service and keeps data fresh via Cloudflare Cron Worker.

- Overall status summary (`Operational / Maintenance / Disruption`)
- Per-service status rows with 7-day timeline
- Timeline event details (maintenance / incident windows)
- Relative freshness indicator (`Synced` / `Delayed`)
- Localized date/time rendering in browser locale
  - time range in local time
  - timezone label (for example `JST`, `BST`, or `GMT+9` depending on browser)
  - locale-aware date format

## Tech Stack

- Astro `^7.0.9`
- TypeScript `^5.9.3`
- Cloudflare Pages Functions
- Cloudflare Workers (Cron trigger)
- Cloudflare KV (`STATUS_EVENTS`)
- Node.js `>=22.12.0`

## Requirements

- Node.js `>=22.12.0`
- npm
- updown.io API key
- Cloudflare account (for Pages/Workers/KV deployment)

## Environment Variables

Create `.env` for local Cloudflare dev:

```env
UPDOWN_API_KEY=your_updown_api_key
```

Used by Pages Functions and Worker to call updown.io.

### Web Push configuration (Cloudflare)

Set these in both Pages and Cron Worker runtime:

- `PUSH_VAPID_PUBLIC_KEY` (plaintext var, URL-safe base64)
- `PUSH_VAPID_PRIVATE_KEY` (secret, URL-safe base64)


This implementation uses Declarative Web Push (Safari `web_push: 8030` payload).
No Service Worker registration is required for push delivery.

## Setup

```bash
npm install
```

## Development Commands

```bash
npm run dev          # Astro dev server
npm run dev:ui       # UI dev server (http://localhost:4321)
npm run dev:cf       # Pages Functions + KV proxy over dev:ui (http://localhost:8788)
npm run dev:cf:dist  # Pages Functions + KV serving prebuilt dist only
npm run check        # Astro/TS checks
npm run build        # Check + build
npm run preview      # Preview build output
```

## Recommended Local Workflow

Run these in parallel:

1. `npm run dev:ui` (fast UI iteration with HMR)
2. `npm run dev:cf` (verify `/api/*`, KV behavior, and end-to-end page behavior)

Use:

- `http://localhost:4321` for UI/CSS iteration
- `http://localhost:8788` for API/KV-integrated behavior

`dev:cf:dist` is for static-dist verification and does not reflect source edits until rebuild.

## Remote KV -> Local KV Sync (for `dev:cf`)

When local data differs from production, sync KV snapshots explicitly.

### 1) Export from remote KV namespace

```bash
mkdir -p debug-data/kv-sync

npx wrangler kv key get events.json \
  --namespace-id 6a495433dc4b40ecac1a328329474222 \
  --remote --text > debug-data/kv-sync/events.remote.json

npx wrangler kv key get status.snapshot.v1.json \
  --namespace-id 6a495433dc4b40ecac1a328329474222 \
  --remote --text > debug-data/kv-sync/status.snapshot.v1.remote.json
```

### 2) Import into local KV used by `npm run dev:cf`

```bash
npx wrangler kv key put events.json \
  --path debug-data/kv-sync/events.remote.json \
  --namespace-id STATUS_EVENTS \
  --local --persist-to .wrangler/state

npx wrangler kv key put status.snapshot.v1.json \
  --path debug-data/kv-sync/status.snapshot.v1.remote.json \
  --namespace-id STATUS_EVENTS \
  --local --persist-to .wrangler/state
```

### 3) Verify local API count

```bash
curl -s http://localhost:8788/api/checks | grep -o '"token":' | wc -l
```

Expected result should match production (`https://status.unchained.co.jp/api/checks`).

> Note: for local import, prefer `--namespace-id STATUS_EVENTS` to target the same local binding used by Pages dev. Using only the remote namespace UUID for local writes may target a different local store.

## Runtime Architecture

### Data flow

1. Cron Worker fetches updown.io and refreshes KV snapshots
2. Pages Functions read from KV (fallback to updown.io when needed)
3. Browser fetches same-origin APIs (`/api/checks`, `/api/events.json`)

### KV documents

- `events.json`
  - event history and per-token latest state
  - includes `generated_at` (updated only when effective content changes)
- `status.snapshot.v1.json`
  - enriched checks with 7-day history + period uptime
  - includes `generated_at` (updated only when checks payload changes)

### Freshness semantics

`/api/events.json` returns `checked_at` on each successful request.

- UI freshness badge (`Synced` / `Delayed`) is based on `checked_at`
- UI rerender decision for event payload changes uses `generated_at`

This avoids false `Delayed` states after write-skip optimization.

## API Endpoints

- `GET /api/checks`
  - Primary: returns KV snapshot (`status.snapshot.v1.json`)
  - Fallback: direct updown.io `/api/checks`
- `GET /api/events.json`
  - Returns KV-backed events doc + `checked_at`
  - Refreshes from updown when KV is stale
- `GET /api/checks/{token}/downtimes`
- `GET /api/checks/{token}/metrics?from=...&to=...`
  - per-token endpoints are kept as fallback/debug paths
- `GET /api/push/config`
  - returns Web Push availability and VAPID public key
- `POST /api/push/subscribe`
  - stores browser push subscription
- `POST /api/push/unsubscribe`
  - removes browser push subscription

## Cron Worker

Worker files:

- Entry: `workers/status-events-cron.ts`
- Config: `wrangler.events-cron.toml`
- Schedule: `*/1 * * * *` (every minute)

Deploy Worker:

Set plaintext vars in `wrangler.events-cron.toml`:

```toml
[vars]
PUSH_VAPID_PUBLIC_KEY = "<your_public_vapid_key>"
```

Set secrets and deploy:

```bash
npx wrangler secret put UPDOWN_API_KEY -c wrangler.events-cron.toml
npx wrangler secret put PUSH_VAPID_PRIVATE_KEY -c wrangler.events-cron.toml
npx wrangler deploy -c wrangler.events-cron.toml
```

## Build Output

- Output directory: `dist/`
- Site setting: `astro.config.mjs` (`site: https://status.unchained.co.jp`)

## Directory Structure

```txt
src/
  pages/
    index.astro                 # Main page (SSR + client refresh logic)
public/
  global.css                    # Global styles
  favicon.svg
  favicon.png
functions/
  api/
    checks.ts                   # Snapshot-first checks API
    events.json.ts              # Events API (+ checked_at)
    checks/[token]/
      downtimes.ts              # Fallback per-check downtimes proxy
      metrics.ts                # Fallback per-check metrics proxy
    push/
      config.ts                 # Push config endpoint
      subscribe.ts              # Store push subscription
      unsubscribe.ts            # Remove push subscription
  _lib/
    status-events.ts            # events.json refresh logic
    status-snapshot.ts          # snapshot refresh logic
    push-subscriptions.ts       # subscription KV helpers
    web-push.ts                 # VAPID JWT + aes128gcm sender (Declarative payload)
workers/
  status-events-cron.ts         # Scheduled refresh worker
wrangler.events-cron.toml
astro.config.mjs
package.json
```

## Browser Verification Checklist

After deployment or cache-sensitive changes:

1. Open status page and hard reload
2. Verify time/date localization
   - time is local (not fixed UTC)
   - timezone label is shown in timeline times
   - date format follows browser locale
3. Verify event/timeline interactions
   - badge tap/click open-close behavior
   - outside click closes popups
   - mobile Safari tap does not double-trigger
4. Verify freshness badge
   - `Synced · ... ago` updates continuously
   - no unexpected `Delayed` when API calls succeed
5. Verify Declarative Web Push
   - `Enable alerts` can subscribe successfully
   - new status transition triggers a browser notification
   - iOS/iPadOS: test from Home Screen app (not Safari tab)

## Notes

- GitHub Actions based status tracking was removed.
- Production data refresh is managed by Cloudflare Pages + Cron Worker.
- Browsers may render timezone names differently (`JST` vs `GMT+9`) based on Intl implementation.
- iOS/iPadOS Safari requires Home Screen launch for Web Push permission.
- Push dispatch is de-duplicated by `push:last-event-id` in KV.
- For one-time resend testing, delete `push:last-event-id` in remote KV.
