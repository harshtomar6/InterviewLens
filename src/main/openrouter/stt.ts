import { promises as fs } from 'fs'
import type { AudioChunk } from '@shared/types'
import { OpenRouterError, postJson } from './client'

export interface RawSegment {
  start: number
  end: number
  text: string
}

interface TranscriptionResponse {
  text?: string
}

/**
 * Transcribe one <50s chunk. OpenRouter's /audio/transcriptions takes JSON with
 * base64 audio (NOT multipart) and returns only flat `text` — no per-word
 * timestamps. We therefore map each chunk to a single segment spanning its known
 * VAD window [offset, offset+duration]; chunks are short and speech-aligned, so
 * this gives accurate-enough segment timing for a labeled, ordered transcript.
 */
export async function transcribeChunk(
  chunk: AudioChunk,
  model: string,
  language: string
): Promise<RawSegment[]> {
  const bytes = await fs.readFile(chunk.path)
  const base64 = bytes.toString('base64')

  const body: Record<string, unknown> = {
    model,
    input_audio: { data: base64, format: 'wav' },
    // temperature 0 makes Whisper deterministic and far less likely to
    // hallucinate foreign-language text on short/quiet chunks.
    temperature: 0
  }
  // A language hint stops per-chunk auto-detection from drifting into the wrong
  // language. Empty string = let the model auto-detect.
  if (language.trim()) body.language = language.trim()

  const result = await postJson<TranscriptionResponse>('/audio/transcriptions', body)

  const text = (result.text ?? '').trim()
  if (!text) return []
  return [{ start: chunk.offset, end: chunk.offset + chunk.duration, text }]
}

const MAX_RETRIES = 2

/** Transcribe with bounded retry on transient (rate-limit / server / network) errors. */
export async function transcribeChunkWithRetry(
  chunk: AudioChunk,
  model: string,
  language: string
): Promise<RawSegment[]> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await transcribeChunk(chunk, model, language)
    } catch (err) {
      lastErr = err
      const transient =
        err instanceof OpenRouterError &&
        (err.kind === 'rate-limit' || err.kind === 'server' || err.kind === 'network')
      if (!transient || attempt === MAX_RETRIES) throw err
      const backoff = 800 * (attempt + 1)
      await new Promise((r) => setTimeout(r, backoff))
    }
  }
  throw lastErr
}
