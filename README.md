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
npm run dev      # Start development server
npm run check    # Run Astro/TS checks
npm run build    # Check + build
npm run preview  # Preview build output
```

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
  events.json        # Auto-recorded state transition log
  favicon.svg
  favicon.png
  assets/
astro.config.mjs
package.json
```

## Data Fetching

The browser fetches service data from same-origin proxy endpoints powered by Pages Functions:

- `/api/checks`
- `/api/checks/{token}/downtimes`
- `/api/checks/{token}/metrics`
- `/api/events.json`

Those Functions call `updown.io` server-side using `UPDOWN_API_KEY` secret, so API keys are not exposed to clients.

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
