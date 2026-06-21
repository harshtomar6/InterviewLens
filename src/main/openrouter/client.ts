import { getApiKey } from '../store/keys'

const BASE = 'https://openrouter.ai/api/v1'

// Sent so OpenRouter can attribute traffic (optional but recommended).
const REFERER = 'https://github.com/yourname/interviewlens'
const TITLE = 'InterviewLens'

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: 'auth' | 'rate-limit' | 'network' | 'server' | 'bad-request'
  ) {
    super(message)
    this.name = 'OpenRouterError'
  }
}

function classify(status: number): OpenRouterError['kind'] {
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate-limit'
  if (status >= 500) return 'server'
  return 'bad-request'
}

async function authHeader(): Promise<string> {
  const key = await getApiKey()
  if (!key) {
    throw new OpenRouterError(
      'No OpenRouter API key set. Add your key in Settings.',
      401,
      'auth'
    )
  }
  return `Bearer ${key}`
}

/** POST JSON to a chat/completions-style endpoint. */
export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const auth = await authHeader()
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
        'HTTP-Referer': REFERER,
        'X-Title': TITLE
      },
      body: JSON.stringify(body)
    })
  } catch (err) {
    throw new OpenRouterError(
      `Network error reaching OpenRouter: ${(err as Error).message}`,
      0,
      'network'
    )
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new OpenRouterError(
      `OpenRouter ${res.status}: ${text.slice(0, 400) || res.statusText}`,
      res.status,
      classify(res.status)
    )
  }
  return (await res.json()) as T
}

/** Cheap auth check: list models (200 = key works). */
export async function testApiKey(): Promise<boolean> {
  const auth = await authHeader()
  const res = await fetch(`${BASE}/models`, {
    headers: { Authorization: auth }
  }).catch(() => null)
  return res?.ok ?? false
}
