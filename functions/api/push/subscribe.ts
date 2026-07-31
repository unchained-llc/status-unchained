import { json } from '../../_lib/updown'
import { normalizeSubscription, putSubscription, type PushKV } from '../../_lib/push-subscriptions'

type Env = {
  STATUS_EVENTS: PushKV
}

type Body = {
  subscription?: unknown
}

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  try {
    const body = (await request.json()) as Body
    const subscription = normalizeSubscription(body.subscription)
    if (!subscription) return json({ ok: false, error: 'invalid_subscription' }, 400)

    const ua = request.headers.get('user-agent') ?? undefined
    await putSubscription(env.STATUS_EVENTS, subscription, ua)
    return json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'internal_error'
    return json({ ok: false, error: message }, 500)
  }
}
