import { json } from '../../_lib/updown'
import { removeSubscriptionByEndpoint, type PushKV } from '../../_lib/push-subscriptions'

type Env = {
  STATUS_EVENTS: PushKV
}

type Body = {
  endpoint?: string
}

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  try {
    const body = (await request.json()) as Body
    if (!body.endpoint || typeof body.endpoint !== 'string') {
      return json({ ok: false, error: 'invalid_endpoint' }, 400)
    }

    await removeSubscriptionByEndpoint(env.STATUS_EVENTS, body.endpoint)
    return json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'internal_error'
    return json({ ok: false, error: message }, 500)
  }
}
