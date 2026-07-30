import { updownJson, type UpdownEnv } from './updown'

export type ServiceState = 'operational' | 'maintenance' | 'disruption'
export type StatusEventType = 'maintenance_started' | 'maintenance_ended' | 'incident_started' | 'incident_resolved' | 'state_changed'

export type Check = {
  token: string
  alias?: string
  enabled: boolean
  down: boolean
}

export type LatestState = {
  token: string
  alias: string
  state: ServiceState
  recorded_at: string
}

export type StatusEvent = {
  token: string
  alias: string
  from: ServiceState
  to: ServiceState
  type: StatusEventType
  at: string
}

export type EventsDoc = {
  generated_at: string | null
  events: StatusEvent[]
  latest: Record<string, LatestState>
}

export type KVLike = {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
}

export type StatusEventsEnv = UpdownEnv & {
  STATUS_EVENTS: KVLike
}

const KV_KEY = 'events.json'
export const STATUS_EVENTS_STALE_MS = 4 * 60 * 1000

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

export const isEventsDocStale = (doc: EventsDoc): boolean => {
  if (!doc.generated_at) return true
  const generatedAt = new Date(doc.generated_at).getTime()
  if (!Number.isFinite(generatedAt)) return true
  return Date.now() - generatedAt >= STATUS_EVENTS_STALE_MS
}

export const loadEventsDoc = async (env: StatusEventsEnv): Promise<EventsDoc> => {
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

export const refreshEventsDoc = async (env: StatusEventsEnv): Promise<EventsDoc> => {
  const now = new Date().toISOString()
  const checks = await updownJson<Check[]>(env, '/api/checks')
  const doc = await loadEventsDoc(env)

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
    } else if (previous.alias !== alias) {
      doc.latest[check.token] = { ...previous, alias }
    }
  }

  const liveTokens = new Set(checks.map((c) => c.token))
  for (const token of Object.keys(doc.latest)) {
    if (!liveTokens.has(token)) {
      delete doc.latest[token]
    }
  }

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  doc.events = doc.events.filter((event) => {
    const at = new Date(event.at).getTime()
    return Number.isFinite(at) && at >= sevenDaysAgo
  })

  doc.generated_at = now
  await env.STATUS_EVENTS.put(KV_KEY, JSON.stringify(doc))

  return doc
}

export const ensureFreshEventsDoc = async (env: StatusEventsEnv): Promise<EventsDoc> => {
  const current = await loadEventsDoc(env)
  return isEventsDocStale(current) ? refreshEventsDoc(env) : current
}
