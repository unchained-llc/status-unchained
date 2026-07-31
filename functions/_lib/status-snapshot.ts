import { updownJson, type UpdownEnv } from './updown'
import type { KVLike, StatusEventsEnv } from './status-events'

type RawCheck = {
  token: string
  url: string
  alias?: string
  enabled: boolean
  published: boolean
  down: boolean
  uptime: number
  last_check_at: string
}

type Metrics = {
  uptime: number
}

type Downtime = {
  started_at: string
  ended_at: string | null
  duration?: number
  partial?: boolean
}

export type DayHistory = {
  date: string
  hadDowntime: boolean
  downtimeSeconds: number
  partial: boolean
  utcWindows: string[]
}

export type SnapshotCheck = RawCheck & {
  periodUptime?: number
  history?: DayHistory[]
}

export type StatusSnapshotDoc = {
  generated_at: string | null
  checks: SnapshotCheck[]
}

type SnapshotEnv = UpdownEnv & {
  STATUS_EVENTS: KVLike
}

type SnapshotReadEnv = {
  STATUS_EVENTS: {
    get(key: string): Promise<string | null>
  }
}

const SNAPSHOT_KEY = 'status.snapshot.v1.json'
const SNAPSHOT_ENRICH_BATCH_SIZE = 10

const defaultDoc = (): StatusSnapshotDoc => ({ generated_at: null, checks: [] })

const dayKey = (value: Date | string) => new Date(value).toISOString().slice(0, 10)

const formatUtcDateTime = (ms: number): string => {
  const iso = new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
  return `${iso.slice(0, 10)} ${iso.slice(11)} UTC`
}

const resolveDowntimeForDay = (downtimes: Downtime[], dayStart: Date, dayEnd: Date) => {
  let totalSeconds = 0
  let partial = false
  const utcWindows: string[] = []

  for (const d of downtimes) {
    const start = new Date(d.started_at).getTime()
    const end = new Date(d.ended_at ?? Date.now()).getTime()
    const overlapStart = Math.max(start, dayStart.getTime())
    const overlapEnd = Math.min(end, dayEnd.getTime())
    if (overlapEnd > overlapStart) {
      totalSeconds += Math.round((overlapEnd - overlapStart) / 1000)
      partial = partial || Boolean(d.partial)
      utcWindows.push(`${formatUtcDateTime(overlapStart)} → ${formatUtcDateTime(overlapEnd)}`)
    }
  }

  return { totalSeconds, partial, utcWindows }
}

const buildHistory = (downtimes: Downtime[]): DayHistory[] => {
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setUTCHours(0, 0, 0, 0)
    date.setUTCDate(date.getUTCDate() - (6 - index))
    return date
  })

  return dates.map((date) => {
    const end = new Date(date)
    end.setUTCDate(end.getUTCDate() + 1)
    const { totalSeconds, partial, utcWindows } = resolveDowntimeForDay(downtimes, date, end)
    return {
      date: dayKey(date),
      hadDowntime: totalSeconds > 0,
      downtimeSeconds: totalSeconds,
      partial,
      utcWindows,
    }
  })
}

export const loadStatusSnapshot = async (env: SnapshotReadEnv): Promise<StatusSnapshotDoc> => {
  try {
    const raw = await env.STATUS_EVENTS.get(SNAPSHOT_KEY)
    if (!raw) return defaultDoc()
    const parsed = JSON.parse(raw) as Partial<StatusSnapshotDoc>
    return {
      generated_at: typeof parsed.generated_at === 'string' ? parsed.generated_at : null,
      checks: Array.isArray(parsed.checks) ? parsed.checks : [],
    }
  } catch {
    return defaultDoc()
  }
}

const mergeRawIntoSnapshot = (previous: SnapshotCheck | undefined, check: RawCheck): SnapshotCheck => ({
  ...check,
  periodUptime: previous?.periodUptime,
  history: previous?.history,
})

const pickEnrichBatch = (checks: RawCheck[], batchSize: number): RawCheck[] => {
  if (checks.length === 0 || batchSize <= 0) return []
  const start = Math.floor(Date.now() / 60000) % checks.length
  const size = Math.min(batchSize, checks.length)
  return Array.from({ length: size }, (_, index) => checks[(start + index) % checks.length])
}

const enrichCheck = async (env: SnapshotEnv, check: RawCheck): Promise<SnapshotCheck | null> => {
  try {
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const to = new Date().toISOString()

    const [metrics, downtimes] = await Promise.all([
      updownJson<Metrics>(env, `/api/checks/${encodeURIComponent(check.token)}/metrics`, new URLSearchParams({ from, to })),
      updownJson<Downtime[]>(env, `/api/checks/${encodeURIComponent(check.token)}/downtimes`),
    ])

    return {
      ...check,
      periodUptime: Number(metrics.uptime),
      history: buildHistory(downtimes),
    }
  } catch {
    return null
  }
}

export const refreshStatusSnapshot = async (env: SnapshotEnv): Promise<StatusSnapshotDoc> => {
  const previous = await loadStatusSnapshot(env)
  const previousByToken = new Map(previous.checks.map((check) => [check.token, check]))

  const checks = await updownJson<RawCheck[]>(env, '/api/checks')
  const liveChecks = [...checks].sort((a, b) => a.token.localeCompare(b.token))

  const nextByToken = new Map<string, SnapshotCheck>()
  for (const check of liveChecks) {
    nextByToken.set(check.token, mergeRawIntoSnapshot(previousByToken.get(check.token), check))
  }

  const batch = pickEnrichBatch(liveChecks, SNAPSHOT_ENRICH_BATCH_SIZE)
  for (const check of batch) {
    const enriched = await enrichCheck(env, check)
    if (enriched) nextByToken.set(check.token, enriched)
  }

  const nextChecks = liveChecks
    .map((check) => nextByToken.get(check.token))
    .filter((check): check is SnapshotCheck => Boolean(check))

  if (JSON.stringify(previous.checks) === JSON.stringify(nextChecks)) {
    return previous
  }

  const doc: StatusSnapshotDoc = { generated_at: new Date().toISOString(), checks: nextChecks }
  await env.STATUS_EVENTS.put(SNAPSHOT_KEY, JSON.stringify(doc))
  return doc
}

export type { SnapshotEnv, StatusEventsEnv }
