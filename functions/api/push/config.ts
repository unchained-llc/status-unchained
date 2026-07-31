import { json } from '../../_lib/updown'

type Env = {
  PUSH_VAPID_PUBLIC_KEY?: string
}

export const onRequestGet = async ({ env }: { env: Env }) => {
  const publicKey = env.PUSH_VAPID_PUBLIC_KEY ?? ''
  return json({
    enabled: Boolean(publicKey),
    publicKey,
  })
}
