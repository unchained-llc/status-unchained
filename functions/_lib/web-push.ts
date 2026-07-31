import type { StoredPushSubscription } from './push-subscriptions'

export type PushEnv = {
  PUSH_VAPID_PUBLIC_KEY?: string
  PUSH_VAPID_PRIVATE_KEY?: string
}

const encoder = new TextEncoder()

const b64url = (input: Uint8Array | string): string => {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const fromB64url = (value: string): Uint8Array => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const out = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new Uint8Array(out)
}

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes)
  return copy.buffer as ArrayBuffer
}

const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
  const len = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(len)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

const hmacSha256 = async (keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey('raw', toArrayBuffer(keyBytes), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, toArrayBuffer(data))
  return new Uint8Array(sig as ArrayBuffer)
}

const hkdfExtract = (salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array> => hmacSha256(salt, ikm)

const hkdfExpand = async (prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> => {
  const hashLen = 32
  const n = Math.ceil(length / hashLen)
  if (n > 255) throw new Error('hkdf_expand_too_long')

  let t: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
  const blocks: Uint8Array[] = []

  for (let i = 1; i <= n; i += 1) {
    const input = concatBytes(t, info, Uint8Array.of(i))
    t = await hmacSha256(prk, input)
    blocks.push(t)
  }

  return concatBytes(...blocks).slice(0, length)
}

const derToRawJose = (sig: Uint8Array): Uint8Array => {
  if (sig.length === 64) return sig
  if (sig[0] !== 0x30) throw new Error('invalid_der_signature')

  let offset = 2
  if (sig[1] & 0x80) offset = 2 + (sig[1] & 0x7f)

  if (sig[offset] !== 0x02) throw new Error('invalid_der_signature_r')
  const rLen = sig[offset + 1]
  const r = sig.slice(offset + 2, offset + 2 + rLen)
  const sOffset = offset + 2 + rLen
  if (sig[sOffset] !== 0x02) throw new Error('invalid_der_signature_s')
  const sLen = sig[sOffset + 1]
  const s = sig.slice(sOffset + 2, sOffset + 2 + sLen)

  const out = new Uint8Array(64)
  out.set(r.slice(Math.max(0, r.length - 32)), 32 - Math.min(32, r.length))
  out.set(s.slice(Math.max(0, s.length - 32)), 64 - Math.min(32, s.length))
  return out
}

const importVapidPrivateKey = async (publicKeyB64Url: string, privateKeyB64Url: string): Promise<CryptoKey> => {
  const publicRaw = fromB64url(publicKeyB64Url)
  if (publicRaw.length !== 65 || publicRaw[0] !== 0x04) throw new Error('invalid_vapid_public_key')
  const privateRaw = fromB64url(privateKeyB64Url)
  if (privateRaw.length !== 32) throw new Error('invalid_vapid_private_key')

  const x = b64url(publicRaw.slice(1, 33))
  const y = b64url(publicRaw.slice(33, 65))
  const d = b64url(privateRaw)

  return crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, d, ext: false, key_ops: ['sign'] },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
}

const buildJwt = async (aud: string, subject: string, publicKey: string, privateKey: string): Promise<string> => {
  const header = b64url('{"typ":"JWT","alg":"ES256"}')
  const payloadObj = {
    aud,
    exp: Math.floor(Date.now() / 1000) + 60 * 10,
    sub: subject,
  }
  const payload = b64url(JSON.stringify(payloadObj))
  const unsigned = `${header}.${payload}`

  const signingKey = await importVapidPrivateKey(publicKey, privateKey)
  const sigRaw = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      signingKey,
      encoder.encode(unsigned),
    ),
  )

  const sigRawJose = derToRawJose(sigRaw)
  return `${unsigned}.${b64url(sigRawJose)}`
}

const encryptPayloadAes128Gcm = async (
  subscription: StoredPushSubscription,
  payload: Uint8Array,
): Promise<Uint8Array> => {
  const userPublic = fromB64url(subscription.keys.p256dh)
  const authSecret = fromB64url(subscription.keys.auth)

  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )

  const localPublic = new Uint8Array(await crypto.subtle.exportKey('raw', localKeyPair.publicKey))
  const remotePublicKey = await crypto.subtle.importKey('raw', toArrayBuffer(userPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: remotePublicKey }, localKeyPair.privateKey, 256))

  const authPrk = await hkdfExtract(authSecret, ecdhSecret)
  const keyInfo = concatBytes(encoder.encode('WebPush: info\u0000'), userPublic, localPublic)
  const ikm = await hkdfExpand(authPrk, keyInfo, 32)

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const contentPrk = await hkdfExtract(salt, ikm)
  const cek = await hkdfExpand(contentPrk, encoder.encode('Content-Encoding: aes128gcm\u0000'), 16)
  const nonce = await hkdfExpand(contentPrk, encoder.encode('Content-Encoding: nonce\u0000'), 12)

  const paddedPayload = concatBytes(payload, Uint8Array.of(0x02))
  const aesKey = await crypto.subtle.importKey('raw', toArrayBuffer(cek), { name: 'AES-GCM' }, false, ['encrypt'])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(nonce), tagLength: 128 },
      aesKey,
      toArrayBuffer(paddedPayload),
    ),
  )

  const rs = 4096
  const rsBytes = new Uint8Array(4)
  rsBytes[0] = (rs >>> 24) & 0xff
  rsBytes[1] = (rs >>> 16) & 0xff
  rsBytes[2] = (rs >>> 8) & 0xff
  rsBytes[3] = rs & 0xff

  const keyIdLen = Uint8Array.of(localPublic.length)
  return concatBytes(salt, rsBytes, keyIdLen, localPublic, ciphertext)
}

export const buildDeclarativeNotificationPayload = (input: {
  title: string
  body: string
  navigate: string
  lang?: string
  appBadge?: string
}): Uint8Array => {
  const payload = {
    web_push: 8030,
    notification: {
      title: input.title,
      body: input.body,
      navigate: input.navigate,
      lang: input.lang ?? 'en-US',
      app_badge: input.appBadge ?? '1',
    },
  }
  return encoder.encode(JSON.stringify(payload))
}

export const sendPush = async (
  env: PushEnv,
  subscription: StoredPushSubscription,
  payload: Uint8Array,
): Promise<{ ok: boolean; stale: boolean; status: number }> => {
  const publicKey = env.PUSH_VAPID_PUBLIC_KEY
  const privateKey = env.PUSH_VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return { ok: false, stale: false, status: 0 }

  const endpointUrl = new URL(subscription.endpoint)
  const aud = endpointUrl.origin
  const jwt = await buildJwt(aud, 'mailto:noreply@unchained.co.jp', publicKey, privateKey)
  const encryptedBody = await encryptPayloadAes128Gcm(subscription, payload)

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      TTL: '120',
      Urgency: 'high',
      Authorization: `vapid t=${jwt}, k=${publicKey}`,
      'Crypto-Key': `p256ecdsa=${publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
    },
    body: toArrayBuffer(encryptedBody),
  })

  if (response.status === 404 || response.status === 410) {
    return { ok: false, stale: true, status: response.status }
  }

  return { ok: response.ok, stale: false, status: response.status }
}
