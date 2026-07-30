import { json, updownJson } from '../_lib/updown'

type Env = { UPDOWN_API_KEY?: string }

type Check = {
  token: string
  url: string
  alias?: string
  enabled: boolean
  published: boolean
  down: boolean
  uptime: number
  last_check_at: string
}

export const onRequestGet = async ({ env }: { env: Env }) => {
  try {
    const checks = await updownJson<Check[]>(env, '/api/checks')
    return json(checks)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'internal_error'
    return json({ error: message }, 500)
  }
}
