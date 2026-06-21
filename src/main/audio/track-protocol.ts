import { protocol } from 'electron'
import { createReadStream } from 'fs'
import { Readable } from 'stream'
import type { TrackSource } from '@shared/types'
import { pathExists, trackPath } from '../store/files'

export const TRACK_SCHEME = 'ilens'

// Must be called BEFORE app is ready.
export function registerTrackScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: TRACK_SCHEME,
      privileges: { stream: true, supportFetchAPI: true, bypassCSP: false, secure: true }
    }
  ])
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SOURCES: TrackSource[] = ['mic', 'system']

// URL shape: ilens://track/<interviewId>/<source>
function parse(url: string): { id: string; source: TrackSource } | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.host !== 'track') return null
  const parts = parsed.pathname.split('/').filter(Boolean)
  const id = parts[0]
  const source = parts[1] as TrackSource | undefined
  // Validate strictly — id is a UUID, source is whitelisted — so the path can
  // never be attacker-controlled traversal.
  if (!id || !UUID_RE.test(id)) return null
  if (!source || !SOURCES.includes(source)) return null
  return { id, source }
}

// Must be called AFTER app is ready.
export function handleTrackScheme(): void {
  protocol.handle(TRACK_SCHEME, async (request) => {
    const parsed = parse(request.url)
    if (!parsed) return new Response('Bad request', { status: 400 })

    const file = trackPath(parsed.id, parsed.source)
    if (!(await pathExists(file))) {
      return new Response('Not found', { status: 404 })
    }
    const stream = Readable.toWeb(createReadStream(file)) as ReadableStream
    return new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'audio/wav' }
    })
  })
}

export function trackUrl(interviewId: string, source: TrackSource): string {
  return `${TRACK_SCHEME}://track/${interviewId}/${source}`
}
