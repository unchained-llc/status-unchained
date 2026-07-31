export type PushSubscriptionJSONLike = {
  endpoint: string
  expirationTime?: number | null
  keys?: {
    p256dh?: string
    auth?: string
  }
}

export type StoredPushSubscription = {
  endpoint: string
  expirationTime: number | null
  keys: {
    p256dh: string
    auth: string
  }
  created_at: string
  updated_at: string
  user_agent?: string
}

export type KVListResult = {
  keys: Array<{ name: string }>
  list_complete?: boolean
  cursor?: string
}

export type PushKV = {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<KVListResult>
}

const SUB_PREFIX = 'push:sub:'

const toHex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')

const endpointHash = async (endpoint: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint))
  return toHex(new Uint8Array(digest))
}

export const subscriptionKeyFromEndpoint = async (endpoint: string): Promise<string> =>
  `${SUB_PREFIX}${await endpointHash(endpoint)}`

export const normalizeSubscription = (input: unknown): PushSubscriptionJSONLike | null => {
  if (!input || typeof input !== 'object') return null
  const sub = input as PushSubscriptionJSONLike
  if (!sub.endpoint || typeof sub.endpoint !== 'string') return null
  const p256dh = sub.keys?.p256dh
  const auth = sub.keys?.auth
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return null
  return {
    endpoint: sub.endpoint,
    expirationTime: typeof sub.expirationTime === 'number' ? sub.expirationTime : null,
    keys: { p256dh, auth },
  }
}

export const putSubscription = async (kv: PushKV, subscription: PushSubscriptionJSONLike, userAgent?: string): Promise<void> => {
  const normalized = normalizeSubscription(subscription)
  if (!normalized || !normalized.keys) throw new Error('invalid_subscription')

  const key = await subscriptionKeyFromEndpoint(normalized.endpoint)
  const now = new Date().toISOString()
  const currentRaw = await kv.get(key)
  const current = currentRaw ? (JSON.parse(currentRaw) as StoredPushSubscription) : null

  const record: StoredPushSubscription = {
    endpoint: normalized.endpoint,
    expirationTime: normalized.expirationTime ?? null,
    keys: {
      p256dh: normalized.keys.p256dh ?? '',
      auth: normalized.keys.auth ?? '',
    },
    created_at: current?.created_at ?? now,
    updated_at: now,
    user_agent: userAgent,
  }

  await kv.put(key, JSON.stringify(record))
}

export const removeSubscriptionByEndpoint = async (kv: PushKV, endpoint: string): Promise<void> => {
  const key = await subscriptionKeyFromEndpoint(endpoint)
  await kv.delete(key)
}

export const listSubscriptions = async (kv: PushKV): Promise<Array<{ key: string; record: StoredPushSubscription }>> => {
  const out: Array<{ key: string; record: StoredPushSubscription }> = []
  let cursor: string | undefined = undefined

  do {
    const page = await kv.list({ prefix: SUB_PREFIX, cursor, limit: 1000 })
    cursor = page.cursor

    for (const keyInfo of page.keys) {
      const raw = await kv.get(keyInfo.name)
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw) as StoredPushSubscription
        if (!parsed.endpoint) continue
        out.push({ key: keyInfo.name, record: parsed })
      } catch {
        // ignore malformed records
      }
    }

    if (page.list_complete) break
  } while (cursor)

  return out
}
