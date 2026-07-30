import { refreshEventsDoc, type StatusEventsEnv } from '../functions/_lib/status-events'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })

export default {
  async scheduled(_controller: unknown, env: StatusEventsEnv): Promise<void> {
    await refreshEventsDoc(env)
  },

  async fetch(_request: Request, env: StatusEventsEnv): Promise<Response> {
    try {
      const doc = await refreshEventsDoc(env)
      return json({ ok: true, generated_at: doc.generated_at })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'internal_error'
      return json({ ok: false, error: message }, 500)
    }
  },
}
