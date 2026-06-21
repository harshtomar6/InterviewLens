import type {
  AudioChunk,
  PipelineProgress,
  PipelineStage,
  Transcript,
  TrackSource,
  UserRole
} from '@shared/types'
import { cleanedMicPath, processedTrackPath, chunksDir } from '../store/files'
import { duckMicWithSystem, probeDuration, resampleTo16kMono } from './ffmpeg'
import { detectSpeech } from './vad'
import { extractChunks } from './chunk'
import { mergeTranscript } from './merge'
import { transcribeChunkWithRetry, type RawSegment } from '../openrouter/stt'

export interface ProcessInput {
  interviewId: string
  role: UserRole
  jobDescription: string
  micWavPath: string
  systemWavPath: string
  sttModel: string
  /** ISO-639-1 language hint for transcription; empty = auto-detect. */
  language: string
  /** Duck the mic against the system track to remove speaker bleed (no headphones). */
  reduceBleed: boolean
}

type ProgressFn = (p: PipelineProgress) => void

function emit(
  cb: ProgressFn,
  interviewId: string,
  stage: PipelineStage,
  detail: string,
  fraction?: number
): void {
  cb({ interviewId, stage, detail, fraction })
}

/** Map with bounded concurrency to avoid hammering the STT endpoint. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i]!, i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

interface PreparedTrack {
  source: TrackSource
  chunks: AudioChunk[]
}

/** VAD + chunk a single already-16k track. */
async function vadAndChunk(
  input: ProcessInput,
  source: TrackSource,
  trackPath: string,
  cb: ProgressFn
): Promise<PreparedTrack> {
  const duration = await probeDuration(trackPath)
  emit(cb, input.interviewId, 'vad', `Detecting speech in ${source} track`)
  const regions = await detectSpeech(trackPath, duration)

  emit(cb, input.interviewId, 'chunk', `Chunking ${source} track (${regions.length} speech regions)`)
  const chunks = await extractChunks(trackPath, chunksDir(input.interviewId, source), regions)
  return { source, chunks }
}

/**
 * Phase 1: resample → (optional bleed reduction) → VAD → chunk → transcribe →
 * merge into one role-labeled, time-ordered transcript. Analysis is a separate
 * phase so a transcript can be persisted even if analysis later fails.
 */
export async function transcribeTracks(
  input: ProcessInput,
  cb: ProgressFn
): Promise<Transcript> {
  const id = input.interviewId
  const micResampled = processedTrackPath(id, 'mic')
  const sysResampled = processedTrackPath(id, 'system')

  emit(cb, id, 'resample', 'Resampling tracks to 16 kHz mono')
  await resampleTo16kMono(input.micWavPath, micResampled)
  await resampleTo16kMono(input.systemWavPath, sysResampled)

  // Remove the other person's speaker bleed from the mic by ducking it against
  // the (clean) system track. Skipped when the user records with headphones.
  let micForVad = micResampled
  if (input.reduceBleed) {
    emit(cb, id, 'resample', 'Reducing speaker bleed in mic track')
    micForVad = cleanedMicPath(id)
    await duckMicWithSystem(micResampled, sysResampled, micForVad)
  }

  const mic = await vadAndChunk(input, 'mic', micForVad, cb)
  const system = await vadAndChunk(input, 'system', sysResampled, cb)

  // 4: transcribe all chunks (both tracks), bounded concurrency.
  const allChunks = [
    ...mic.chunks.map((c) => ({ source: 'mic' as const, chunk: c })),
    ...system.chunks.map((c) => ({ source: 'system' as const, chunk: c }))
  ]
  if (allChunks.length === 0) {
    throw new Error(
      'No speech was detected in either track. The recording may be silent — check that the call audio was playing and your mic was live.'
    )
  }

  let completed = 0
  const transcribed = await mapLimit(allChunks, 3, async (item) => {
    const segments = await transcribeChunkWithRetry(item.chunk, input.sttModel, input.language)
    completed++
    emit(
      cb,
      input.interviewId,
      'transcribe',
      `Transcribed ${completed}/${allChunks.length} chunks`,
      completed / allChunks.length
    )
    return { source: item.source, segments }
  })

  const micSegments: RawSegment[] = transcribed
    .filter((t) => t.source === 'mic')
    .flatMap((t) => t.segments)
  const systemSegments: RawSegment[] = transcribed
    .filter((t) => t.source === 'system')
    .flatMap((t) => t.segments)

  // 5: merge into one role-labeled, time-sorted transcript.
  emit(cb, input.interviewId, 'merge', 'Merging and labeling transcript')
  const transcript = mergeTranscript(input.role, micSegments, systemSegments)
  if (transcript.segments.length === 0) {
    throw new Error('Transcription returned no text. The audio may be too quiet or empty.')
  }
  return transcript
}
