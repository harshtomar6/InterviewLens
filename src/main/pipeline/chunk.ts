import { promises as fs } from 'fs'
import { join } from 'path'
import type { AudioChunk, SpeechRegion } from '@shared/types'
import { runFfmpeg } from './ffmpeg'

export interface ChunkOptions {
  /** Hard cap per chunk (s). Kept under OpenRouter's ~60s upstream timeout. */
  maxChunkSec: number
  /** Silence gap larger than this closes the current chunk (drops dead air). */
  maxGapSec: number
}

export const DEFAULT_CHUNK: ChunkOptions = {
  maxChunkSec: 45,
  maxGapSec: 2.0
}

interface Window {
  start: number
  end: number
}

/** Pack contiguous speech regions into bounded windows. */
export function planChunks(regions: SpeechRegion[], opts: ChunkOptions = DEFAULT_CHUNK): Window[] {
  const windows: Window[] = []
  let current: Window | null = null

  for (const r of regions) {
    if (!current) {
      current = { start: r.start, end: r.end }
      continue
    }
    const wouldExceed = r.end - current.start > opts.maxChunkSec
    const bigGap = r.start - current.end > opts.maxGapSec
    if (wouldExceed || bigGap) {
      windows.push(current)
      current = { start: r.start, end: r.end }
    } else {
      current.end = r.end
    }
  }
  if (current) windows.push(current)

  // A single region longer than maxChunkSec must be split further.
  const split: Window[] = []
  for (const w of windows) {
    let s = w.start
    while (w.end - s > opts.maxChunkSec) {
      split.push({ start: s, end: s + opts.maxChunkSec })
      s += opts.maxChunkSec
    }
    if (w.end - s > 0.05) split.push({ start: s, end: w.end })
  }
  return split
}

/**
 * Extract each planned window from the 16k track into its own WAV file,
 * recording the absolute offset so timestamps can be rebased after STT.
 */
export async function extractChunks(
  input: string,
  outDir: string,
  regions: SpeechRegion[],
  opts: ChunkOptions = DEFAULT_CHUNK
): Promise<AudioChunk[]> {
  await fs.mkdir(outDir, { recursive: true })
  const windows = planChunks(regions, opts)
  const chunks: AudioChunk[] = []

  for (let i = 0; i < windows.length; i++) {
    const w = windows[i]!
    const duration = w.end - w.start
    const path = join(outDir, `chunk_${String(i).padStart(4, '0')}.wav`)
    await runFfmpeg([
      '-y',
      '-ss', w.start.toFixed(3),
      '-i', input,
      '-t', duration.toFixed(3),
      '-ac', '1',
      '-ar', '16000',
      '-c:a', 'pcm_s16le',
      path
    ])
    chunks.push({ path, offset: w.start, duration })
  }
  return chunks
}
