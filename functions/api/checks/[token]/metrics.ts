import { json, updownJson } from '../../../_lib/updown'

type Env = { UPDOWN_API_KEY?: string }

type Metrics = {
  uptime: number
}

export const onRequestGet = async ({ env, params, request }: { env: Env; params: { token: string }; request: Request }) => {
  try {
    const token = params.token
    const url = new URL(request.url)
    const search = new URLSearchParams()
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    if (from) search.set('from', from)
    if (to) search.set('to', to)
    const metrics = await updownJson<Metrics>(env, `/api/checks/${encodeURIComponent(token)}/metrics`, search)
    return json(metrics)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'internal_error'
    return json({ error: message }, 500)
  }
}
