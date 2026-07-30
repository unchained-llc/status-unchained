# UNCHAINED Status Page

Status page for `status.unchained.co.jp`
Built with Astro and displays check results from `updown.io`

## Overview

- Displays a list of service health statuses
- Shows overall status (Operational / Maintenance / Disruption)
- Displays 7-day history bars
- Displays relative time since the last check
- Displays 7-Day Uptime

## Tech Stack

- Astro `^7.0.9`
- TypeScript `^5.9.3`
- @astrojs/check `^0.9.6`
- Node.js `>=22.12.0`

## Setup

```bash
npm install
```

## Development Commands

```bash
npm run dev        # Start development server (UI only)
npm run dev:ui     # UI dev server (http://localhost:4321)
npm run dev:cf     # Pages Functions + KV proxy over dev:ui (http://localhost:8788)
npm run dev:cf:dist # Pages Functions + KV serving prebuilt dist only
npm run check      # Run Astro/TS checks
npm run build      # Check + build
npm run preview    # Preview build output
```

## Local Development Workflow (Recommended)

For fast UI iteration and accurate Cloudflare API/KV behavior, run two processes:

1. `npm run dev:ui` (Astro HMR, fastest feedback for UI/CSS)
2. `npm run dev:cf` (Pages Functions + KV at `http://localhost:8788`)

Use `http://localhost:4321` while styling/DOM-tuning, and use `http://localhost:8788` for `/api/*` behavior checks.

`dev:cf:dist` is for static-dist verification only and may not reflect live source edits until rebuilt.

## Build Output

- Output directory: `dist/`
- Site config: `astro.config.mjs` (`site: https://status.unchained.co.jp`)

## Directory Structure

```txt
src/
  pages/
    index.astro      # Main page (SSR initial render + client updates)
public/
  global.css         # Global styles
  favicon.svg
  favicon.png
  assets/
astro.config.mjs
package.json
```

## Data Fetching

The browser fetches service data from same-origin proxy endpoints powered by Pages Functions:

- `/api/checks`
- `/api/events.json`

Primary data path is KV-backed (`STATUS_EVENTS`) via Cron Worker snapshots.
Per-token endpoints (`/api/checks/{token}/downtimes`, `/api/checks/{token}/metrics`) remain only as fallback paths.

## Automated Event Tracking (Maintenance/Incidents)

### Cloudflare Pages Functions mode

`functions/api/events.json.ts` reads event history from Cloudflare KV.
If KV data is stale, it refreshes from updown and writes back to KV.

Required Cloudflare bindings/secrets:

- KV binding: `STATUS_EVENTS`
- Secret: `UPDOWN_API_KEY`

### Cloudflare Cron Worker mode (near real-time, recommended)

To keep KV warm without waiting for page traffic, this repo includes a dedicated scheduled Worker:

- Worker entry: `workers/status-events-cron.ts`
- Worker config: `wrangler.events-cron.toml`
- Cron: every minute (`*/1 * * * *`)

Deploy steps:

```bash
npx wrangler secret put UPDOWN_API_KEY -c wrangler.events-cron.toml
npx wrangler deploy -c wrangler.events-cron.toml
```

After deploy, KV is updated every minute by Cron, and `/api/events.json` serves the latest KV data.

GitHub Actions based tracking/deploy has been removed from this repository.
Cloudflare Pages + Worker Cron is the single source of truth for production updates.

## UI Notes (Current)

- Applies state-specific effects to the rightmost “current indicator”
  - Normal (green): rapid blink + fixed glow
  - Maintenance (yellow): slow breathing (no glow)
  - Incident (red): fixed display (no glow)
