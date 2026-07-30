import { json, updownJson } from '../_lib/updown'
import { loadStatusSnapshot, type SnapshotCheck } from '../_lib/status-snapshot'

type Env = {
  STATUS_EVENTS: { get(key: string): Promise<string | null> }
  UPDOWN_API_KEY?: string
}

export const onRequestGet = async ({ env }: { env: Env }) => {
  try {
    const snapshot = await loadStatusSnapshot(env)
    if (Array.isArray(snapshot.checks) && snapshot.checks.length > 0) {
      return json(snapshot.checks)
    }

    const checks = await updownJson<SnapshotCheck[]>(env, '/api/checks')
    return json(checks)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'internal_error'
    return json({ error: message }, 500)
  }
}
