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
.github/
  workflows/
    deploy-pages.yml
    track-status-events.yml
  scripts/
    track-status-events.mjs
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

### Legacy mode (GitHub Actions)

`track-status-events.yml` runs every 5 minutes and updates `public/events.json`

- Recorded event types:
  - `maintenance_started`
  - `maintenance_ended`
  - `incident_started`
  - `incident_resolved`
- Does not append when state is unchanged
- On first run, creates a baseline only (no event generation)
- Keeps only the last 7 days of events

### API Key

`UPDOWN_API_KEY` should be configured in GitHub Secrets when using the legacy workflow.
No default API key is embedded.

### Cloudflare Worker Runtime mode (recommended for Pages)

A runtime endpoint is available at `functions/api/events.json.ts`.
It stores and serves events data from Cloudflare KV and refreshes from updown when stale.

Required Cloudflare bindings/secrets:

- KV binding: `STATUS_EVENTS`
- Secret (optional but recommended): `UPDOWN_API_KEY`

The browser now fetches event data from `/api/events.json`.

After enabling this mode, you can disable `track-status-events.yml` if you no longer want GitHub-commit based updates.

## UI Notes (Current)

- Applies state-specific effects to the rightmost “current indicator”
  - Normal (green): rapid blink + fixed glow
  - Maintenance (yellow): slow breathing (no glow)
  - Incident (red): fixed display (no glow)
