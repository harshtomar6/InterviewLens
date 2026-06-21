// Display formatting helpers shared across screens.

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m < 60) return `${m}m ${rem}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

const TIME_FMT: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }

/** Friendly timestamp: "Today, 3:57 PM" / "Yesterday, 3:41 PM" / "Mon, 3:12 PM" / "21 Jun 2026, 3:02 PM". */
export function formatRelative(ms: number): string {
  const d = new Date(ms)
  const now = new Date()
  const time = d.toLocaleTimeString(undefined, TIME_FMT)
  if (sameDay(d, now)) return `Today, ${time}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return `Yesterday, ${time}`
  const diffDays = (now.getTime() - ms) / 86_400_000
  if (diffDays < 7 && diffDays > 0) {
    return `${d.toLocaleDateString(undefined, { weekday: 'short' })}, ${time}`
  }
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}, ${time}`
}

export function formatFull(ms: number): string {
  return new Date(ms).toLocaleString()
}

export type DayBucket = 'Today' | 'Yesterday' | 'Earlier this week' | 'Earlier'

export function dayBucket(ms: number): DayBucket {
  const d = new Date(ms)
  const now = new Date()
  if (sameDay(d, now)) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return 'Yesterday'
  const diffDays = (now.getTime() - ms) / 86_400_000
  return diffDays < 7 ? 'Earlier this week' : 'Earlier'
}

export interface CleanError {
  summary: string
  details: string
}

/**
 * Turn a raw thrown error (often an OpenRouter JSON dump) into a short,
 * human-readable summary plus the full text for an optional details disclosure.
 */
export function cleanError(raw: string | undefined, phase: 'transcription' | 'analysis'): CleanError {
  const text = (raw ?? '').trim()
  const lower = text.toLowerCase()
  const label = phase === 'analysis' ? 'Analysis' : 'Transcription'

  let summary = `${label} failed.`
  if (lower.includes('no speech')) summary = 'No speech detected in the recording.'
  else if (lower.includes('no endpoints found') || lower.includes('not a valid model'))
    summary = 'The selected model is unavailable on OpenRouter.'
  else if (lower.includes('api key') || lower.includes('401') || lower.includes('403'))
    summary = 'OpenRouter API key was rejected — check it in Setup.'
  else if (lower.includes('429') || lower.includes('rate'))
    summary = 'OpenRouter rate limit hit — try again shortly.'
  else if (lower.includes('network') || lower.includes('fetch'))
    summary = 'Network error reaching OpenRouter.'
  else if (lower.includes('400') || lower.includes('invalid'))
    summary = `${label} request was rejected by OpenRouter.`

  return { summary, details: text }
}
