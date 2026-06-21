import type { SpeechRegion } from '@shared/types'
import { runFfmpeg } from './ffmpeg'

export interface VadOptions {
  /** Noise floor below which audio counts as silence. */
  noiseDb: number
  /** Minimum silence length (s) to register a gap. */
  minSilenceSec: number
  /** Pad kept speech regions by this much on each side (s). */
  padSec: number
  /** Drop speech regions shorter than this (s) — likely noise. */
  minSpeechSec: number
  /** Merge speech regions separated by less than this (s). */
  mergeGapSec: number
}

export const DEFAULT_VAD: VadOptions = {
  noiseDb: -35,
  minSilenceSec: 0.6,
  padSec: 0.25,
  minSpeechSec: 0.4,
  mergeGapSec: 0.5
}

interface Silence {
  start: number
  end: number
}

function parseSilences(stderr: string, totalDuration: number): Silence[] {
  const silences: Silence[] = []
  let pendingStart: number | null = null
  const lines = stderr.split('\n')
  for (const line of lines) {
    const startMatch = line.match(/silence_start:\s*(-?\d+(?:\.\d+)?)/)
    if (startMatch) {
      pendingStart = Math.max(0, parseFloat(startMatch[1] ?? '0'))
      continue
    }
    const endMatch = line.match(/silence_end:\s*(-?\d+(?:\.\d+)?)/)
    if (endMatch && pendingStart !== null) {
      silences.push({ start: pendingStart, end: parseFloat(endMatch[1] ?? '0') })
      pendingStart = null
    }
  }
  // Trailing silence with no end -> runs to track end.
  if (pendingStart !== null && totalDuration > pendingStart) {
    silences.push({ start: pendingStart, end: totalDuration })
  }
  return silences
}

/** Invert silence list into speech regions across [0, total]. */
function invert(silences: Silence[], total: number): SpeechRegion[] {
  const regions: SpeechRegion[] = []
  let cursor = 0
  for (const s of silences) {
    if (s.start > cursor) regions.push({ start: cursor, end: s.start })
    cursor = Math.max(cursor, s.end)
  }
  if (cursor < total) regions.push({ start: cursor, end: total })
  return regions
}

function postProcess(regions: SpeechRegion[], total: number, o: VadOptions): SpeechRegion[] {
  // Pad
  const padded = regions.map((r) => ({
    start: Math.max(0, r.start - o.padSec),
    end: Math.min(total, r.end + o.padSec)
  }))
  // Merge near-adjacent
  const merged: SpeechRegion[] = []
  for (const r of padded) {
    const last = merged[merged.length - 1]
    if (last && r.start - last.end <= o.mergeGapSec) {
      last.end = Math.max(last.end, r.end)
    } else {
      merged.push({ ...r })
    }
  }
  // Drop too-short
  return merged.filter((r) => r.end - r.start >= o.minSpeechSec)
}

/**
 * Detect speech regions in a (preferably 16k mono) WAV. Returns regions sorted
 * by start. If the whole track is silent, returns []. If silencedetect finds no
 * silence at all, returns one region spanning the track.
 */
export async function detectSpeech(
  input: string,
  totalDuration: number,
  opts: VadOptions = DEFAULT_VAD
): Promise<SpeechRegion[]> {
  if (totalDuration <= 0) return []
  const filter = `silencedetect=noise=${opts.noiseDb}dB:d=${opts.minSilenceSec}`
  const { stderr } = await runFfmpeg([
    '-i', input,
    '-af', filter,
    '-f', 'null', '-'
  ])
  const silences = parseSilences(stderr, totalDuration)
  if (silences.length === 0) {
    return [{ start: 0, end: totalDuration }]
  }
  const speech = invert(silences, totalDuration)
  return postProcess(speech, totalDuration, opts)
}
