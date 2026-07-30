import { json } from '../_lib/updown'
import { ensureFreshEventsDoc, type StatusEventsEnv } from '../_lib/status-events'

type Env = StatusEventsEnv

export const onRequestGet = async ({ env }: { env: Env }) => {
  try {
    const doc = await ensureFreshEventsDoc(env)
    return json(doc)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'internal_error'
    return json({ error: message }, 500)
  }
}
