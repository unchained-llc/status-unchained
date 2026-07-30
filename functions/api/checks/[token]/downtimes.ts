import { json, updownJson } from '../../../_lib/updown'

type Env = { UPDOWN_API_KEY?: string }

type Downtime = {
  started_at: string
  ended_at: string | null
  duration?: number
  partial?: boolean
}

export const onRequestGet = async ({ env, params }: { env: Env; params: { token: string } }) => {
  try {
    const token = params.token
    const downtimes = await updownJson<Downtime[]>(env, `/api/checks/${encodeURIComponent(token)}/downtimes`)
    return json(downtimes)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'internal_error'
    return json({ error: message }, 500)
  }
}
