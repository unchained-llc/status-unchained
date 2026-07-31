import { refreshEventsDoc, type StatusEventsEnv } from '../functions/_lib/status-events'
import { refreshStatusSnapshot } from '../functions/_lib/status-snapshot'
import { listSubscriptions, type PushKV } from '../functions/_lib/push-subscriptions'
import { buildDeclarativeNotificationPayload, sendPush, type PushEnv } from '../functions/_lib/web-push'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })

const PUSH_LAST_EVENT_KEY = 'push:last-event-id'

type PushWorkerEnv = StatusEventsEnv & PushEnv

const latestEventId = (doc: Awaited<ReturnType<typeof refreshEventsDoc>>): string | null => {
  const latest = doc.events[0]
  if (!latest) return null
  return `${latest.token}:${latest.at}:${latest.type}:${latest.to}`
}

const declarativeMessageFor = (event: Awaited<ReturnType<typeof refreshEventsDoc>>['events'][number]) => {
  const alias = event.alias?.trim() || `Check ${event.token}`
  if (event.to === 'disruption') {
    return {
      title: `UNCHAINED Status · ${alias}`,
      body: 'Disruption detected',
      navigate: 'https://status.unchained.co.jp/',
    }
  }
  if (event.to === 'maintenance') {
    return {
      title: `UNCHAINED Status · ${alias}`,
      body: 'Entered maintenance',
      navigate: 'https://status.unchained.co.jp/',
    }
  }
  return {
    title: `UNCHAINED Status · ${alias}`,
    body: 'Recovered to operational',
    navigate: 'https://status.unchained.co.jp/',
  }
}

const dispatchPushIfNeeded = async (
  env: PushWorkerEnv,
  doc: Awaited<ReturnType<typeof refreshEventsDoc>>,
): Promise<{ sent: number; stale_removed: number; skipped: boolean }> => {
  const latest = doc.events[0]
  const eventId = latestEventId(doc)
  if (!latest || !eventId) return { sent: 0, stale_removed: 0, skipped: true }

  const lastSent = await env.STATUS_EVENTS.get(PUSH_LAST_EVENT_KEY)
  if (lastSent === eventId) return { sent: 0, stale_removed: 0, skipped: true }

  const subscriptions = await listSubscriptions(env.STATUS_EVENTS as PushKV)
  const payload = buildDeclarativeNotificationPayload(declarativeMessageFor(latest))
  let sent = 0
  let staleRemoved = 0

  for (const entry of subscriptions) {
    try {
      const result = await sendPush(env, entry.record, payload)
      if (result.ok) {
        sent += 1
        continue
      }
      if (result.stale && env.STATUS_EVENTS.delete) {
        await env.STATUS_EVENTS.delete(entry.key)
        staleRemoved += 1
      }
    } catch {
      // keep others flowing
    }
  }

  await env.STATUS_EVENTS.put(PUSH_LAST_EVENT_KEY, eventId)
  return { sent, stale_removed: staleRemoved, skipped: false }
}

export default {
  async scheduled(_controller: unknown, env: PushWorkerEnv): Promise<void> {
    await refreshStatusSnapshot(env)
    const events = await refreshEventsDoc(env)
    await dispatchPushIfNeeded(env, events)
  },

  async fetch(_request: Request, env: PushWorkerEnv): Promise<Response> {
    try {
      const snapshot = await refreshStatusSnapshot(env)
      const events = await refreshEventsDoc(env)
      const push = await dispatchPushIfNeeded(env, events)
      return json({ ok: true, generated_at: events.generated_at, snapshot_generated_at: snapshot.generated_at, push })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'internal_error'
      return json({ ok: false, error: message }, 500)
    }
  },
}
