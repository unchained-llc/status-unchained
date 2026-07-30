import { json, updownJson } from '../_lib/updown'

type ServiceState = 'operational' | 'maintenance' | 'disruption'
type StatusEventType = 'maintenance_started' | 'maintenance_ended' | 'incident_started' | 'incident_resolved' | 'state_changed'

type Check = {
  token: string
  alias?: string
  enabled: boolean
  down: boolean
}

type LatestState = {
  token: string
  alias: string
  state: ServiceState
  recorded_at: string
}

type StatusEvent = {
  token: string
  alias: string
  from: ServiceState
  to: ServiceState
  type: StatusEventType
  at: string
}

type EventsDoc = {
  generated_at: string | null
  events: StatusEvent[]
  latest: Record<string, LatestState>
}

type KVLike = {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
}

type Env = {
  STATUS_EVENTS: KVLike
  UPDOWN_API_KEY?: string
}


const KV_KEY = 'events.json'
const STALE_MS = 4 * 60 * 1000

const resolveState = (check: Check): ServiceState => {
  if (check.down) return 'disruption'
  if (!check.enabled) return 'maintenance'
  return 'operational'
}

const transitionType = (from: ServiceState, to: ServiceState): StatusEventType => {
  if (to === 'maintenance') return 'maintenance_started'
  if (from === 'maintenance' && to === 'operational') return 'maintenance_ended'
  if (to === 'disruption') return 'incident_started'
  if (from === 'disruption' && to === 'operational') return 'incident_resolved'
  return 'state_changed'
}

const defaultDoc = (): EventsDoc => ({ generated_at: null, events: [], latest: {} })

const isStale = (doc: EventsDoc): boolean => {
  if (!doc.generated_at) return true
  const generatedAt = new Date(doc.generated_at).getTime()
  if (!Number.isFinite(generatedAt)) return true
  return Date.now() - generatedAt >= STALE_MS
}

const loadDoc = async (env: Env): Promise<EventsDoc> => {
  try {
    const raw = await env.STATUS_EVENTS.get(KV_KEY)
    if (!raw) return defaultDoc()
    const parsed = JSON.parse(raw) as Partial<EventsDoc>
    return {
      generated_at: typeof parsed.generated_at === 'string' ? parsed.generated_at : null,
      events: Array.isArray(parsed.events) ? parsed.events : [],
      latest: parsed.latest && typeof parsed.latest === 'object' ? (parsed.latest as Record<string, LatestState>) : {},
    }
  } catch {
    return defaultDoc()
  }
}

const refreshDoc = async (env: Env): Promise<EventsDoc> => {
  const now = new Date().toISOString()
  const checks = await updownJson<Check[]>(env, '/api/checks')
  const doc = await loadDoc(env)

  let changed = false

  for (const check of checks) {
    const currentState = resolveState(check)
    const previous = doc.latest[check.token]
    const alias = check.alias?.trim() || `Check ${check.token}`

    if (!previous || typeof previous.state !== 'string') {
      doc.latest[check.token] = {
        token: check.token,
        alias,
        state: currentState,
        recorded_at: now,
      }
      changed = true
      continue
    }

    if (previous.state !== currentState) {
      doc.events.unshift({
        token: check.token,
        alias,
        from: previous.state,
        to: currentState,
        type: transitionType(previous.state, currentState),
        at: now,
      })
      doc.latest[check.token] = {
        token: check.token,
        alias,
        state: currentState,
        recorded_at: now,
      }
      changed = true
    } else if (previous.alias !== alias) {
      doc.latest[check.token] = { ...previous, alias }
      changed = true
    }
  }

  const liveTokens = new Set(checks.map((c) => c.token))
  for (const token of Object.keys(doc.latest)) {
    if (!liveTokens.has(token)) {
      delete doc.latest[token]
      changed = true
    }
  }

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const filtered = doc.events.filter((event) => {
    const at = new Date(event.at).getTime()
    return Number.isFinite(at) && at >= sevenDaysAgo
  })
  if (filtered.length !== doc.events.length) {
    doc.events = filtered
    changed = true
  }

  if (changed || !doc.generated_at) {
    doc.generated_at = now
    await env.STATUS_EVENTS.put(KV_KEY, JSON.stringify(doc))
  }

  return doc
}



export const onRequestGet = async ({ env }: { env: Env }) => {
  try {
    const current = await loadDoc(env)
    const doc = isStale(current) ? await refreshDoc(env) : current
    return json(doc)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'internal_error'
    return json({ error: message }, 500)
  }
}
