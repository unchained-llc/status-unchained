export type UpdownEnv = {
  UPDOWN_API_KEY?: string
}

export const getUpdownApiKey = (env: UpdownEnv): string => {
  const key = env.UPDOWN_API_KEY?.trim()
  if (!key) throw new Error('UPDOWN_API_KEY is not configured')
  return key
}

export const updownJson = async <T>(env: UpdownEnv, path: string, params?: URLSearchParams): Promise<T> => {
  const apiKey = getUpdownApiKey(env)
  const qs = params ? `${params.toString()}&` : ''
  const url = `https://updown.io${path}?${qs}api-key=${encodeURIComponent(apiKey)}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`updown request failed: ${response.status} ${path}`)
  }
  return (await response.json()) as T
}

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
