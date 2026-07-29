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

`src/pages/index.astro` uses the `updown.io` API to fetch:

- Check list: `/api/checks`
- Downtime history: `/api/checks/{token}/downtimes`
- Metrics: `/api/checks/{token}/metrics`

The current implementation references a read-only API key in the page
Depending on your operational requirements, consider switching to environment variables or a proxy API

## Automated Event Tracking (Maintenance/Incidents)

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

If `UPDOWN_API_KEY` is configured in GitHub Secrets, it is used with priority
If not configured, the default key in the script is used

## UI Notes (Current)

- Applies state-specific effects to the rightmost “current indicator”
  - Normal (green): rapid blink + fixed glow
  - Maintenance (yellow): slow breathing (no glow)
  - Incident (red): fixed display (no glow)
