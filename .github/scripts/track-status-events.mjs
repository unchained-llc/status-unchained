import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const EVENTS_PATH = path.join(ROOT, 'public', 'events.json');

const DEFAULT_API_KEY = 'ro-REDACTED';
const apiKey = process.env.UPDOWN_API_KEY || process.env.STATUS_UPDOWN_KEY || DEFAULT_API_KEY;

/** @typedef {'operational'|'maintenance'|'disruption'} ServiceState */

/**
 * @param {{down:boolean;enabled:boolean}} check
 * @returns {ServiceState}
 */
function resolveState(check) {
  if (check.down) return 'disruption';
  if (!check.enabled) return 'maintenance';
  return 'operational';
}

/**
 * @param {ServiceState} from
 * @param {ServiceState} to
 */
function transitionType(from, to) {
  if (to === 'maintenance') return 'maintenance_started';
  if (from === 'maintenance' && to === 'operational') return 'maintenance_ended';
  if (to === 'disruption') return 'incident_started';
  if (from === 'disruption' && to === 'operational') return 'incident_resolved';
  return 'state_changed';
}

async function fetchChecks() {
  const url = `https://updown.io/api/checks?api-key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`updown checks fetch failed: ${res.status}`);
  /** @type {Array<{token:string;alias?:string;enabled:boolean;down:boolean}>} */
  const checks = await res.json();
  return checks;
}

async function loadEventsFile() {
  try {
    const raw = await readFile(EVENTS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('events.json is invalid');
    return {
      generated_at: parsed.generated_at ?? null,
      events: Array.isArray(parsed.events) ? parsed.events : [],
      latest: parsed.latest && typeof parsed.latest === 'object' ? parsed.latest : {},
    };
  } catch {
    return {
      generated_at: null,
      events: [],
      latest: {},
    };
  }
}

async function main() {
  const now = new Date().toISOString();
  const checks = await fetchChecks();
  const doc = await loadEventsFile();

  let changed = false;

  for (const check of checks) {
    const currentState = resolveState(check);
    const previous = doc.latest[check.token];

    // 初回検知はベースラインとして保存のみ（イベントは起こさない）
    if (!previous || typeof previous.state !== 'string') {
      doc.latest[check.token] = {
        token: check.token,
        alias: check.alias?.trim() || `Check ${check.token}`,
        state: currentState,
        recorded_at: now,
      };
      changed = true;
      continue;
    }

    if (previous.state !== currentState) {
      doc.events.unshift({
        token: check.token,
        alias: check.alias?.trim() || `Check ${check.token}`,
        from: previous.state,
        to: currentState,
        type: transitionType(previous.state, currentState),
        at: now,
      });

      doc.latest[check.token] = {
        token: check.token,
        alias: check.alias?.trim() || `Check ${check.token}`,
        state: currentState,
        recorded_at: now,
      };
      changed = true;
    } else if ((check.alias?.trim() || `Check ${check.token}`) !== previous.alias) {
      doc.latest[check.token] = {
        ...previous,
        alias: check.alias?.trim() || `Check ${check.token}`,
      };
      changed = true;
    }
  }

  // 削除されたチェックは latest から除外
  const liveTokens = new Set(checks.map((c) => c.token));
  for (const token of Object.keys(doc.latest)) {
    if (!liveTokens.has(token)) {
      delete doc.latest[token];
      changed = true;
    }
  }

  if (doc.events.length > 1000) {
    doc.events = doc.events.slice(0, 1000);
    changed = true;
  }

  if (!changed) {
    console.log('no state changes');
    return;
  }

  doc.generated_at = now;
  await writeFile(EVENTS_PATH, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  console.log('events.json updated');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
