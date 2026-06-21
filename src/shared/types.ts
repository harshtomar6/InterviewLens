import type { SpeakerLabel, TrackSource, UserRole } from './roles'

export type { UserRole, TrackSource, SpeakerLabel }

/** One transcribed utterance, timestamps relative to recording start (seconds). */
export interface TranscriptSegment {
  source: TrackSource
  speaker: SpeakerLabel
  start: number
  end: number
  text: string
}

export interface Transcript {
  segments: TranscriptSegment[]
}

/** A speech region kept after VAD, relative to the track's start (seconds). */
export interface SpeechRegion {
  start: number
  end: number
}

/** A <50s audio chunk handed to the STT endpoint, with its absolute offset. */
export interface AudioChunk {
  path: string
  /** Offset of this chunk from recording start (seconds). */
  offset: number
  duration: number
}

export type InterviewStatus =
  | 'recording'
  | 'processing'
  | 'complete'
  | 'error'

export interface InterviewMeta {
  id: string
  title: string
  role: UserRole
  jobDescription: string
  createdAt: number
  status: InterviewStatus
  durationSec: number
  error?: string
  /** True when a transcript is stored (so analysis can be re-run without re-transcribing). */
  hasTranscript: boolean
}

/** A perspective is just a role used as the analysis lens, independent of the
 * recording's own role (which defines the immutable speaker labels). */
export type Perspective = UserRole

export interface Interview extends InterviewMeta {
  micWavPath: string
  systemWavPath: string
  transcript: Transcript | null
  /** Analysis report per perspective; null until generated for that lens. */
  analyses: Record<Perspective, string | null>
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatThread {
  id: string
  interviewId: string
  title: string
  messages: ChatMessage[]
  createdAt: number
}

// ---- Recording payload from renderer -> main ----

export interface SaveTrackPayload {
  interviewId: string
  source: TrackSource
  /** Raw bytes of a WAV (PCM) file produced in the renderer. */
  bytes: ArrayBuffer
}

// ---- Pipeline progress events (main -> renderer) ----

export type PipelineStage =
  | 'resample'
  | 'vad'
  | 'chunk'
  | 'transcribe'
  | 'merge'
  | 'analyze'
  | 'done'

export interface PipelineProgress {
  interviewId: string
  stage: PipelineStage
  detail: string
  /** 0..1 within the stage, when known. */
  fraction?: number
}

// ---- Settings ----

export interface AppSettings {
  sttModel: string
  analysisModel: string
  /** ISO-639-1 hint for transcription (e.g. "en"). Empty = auto-detect. */
  language: string
  /** Duck the mic against the system track to remove speaker bleed. */
  reduceBleed: boolean
  hasApiKey: boolean
}

export const DEFAULT_SETTINGS: Omit<AppSettings, 'hasApiKey'> = {
  sttModel: 'openai/whisper-large-v3',
  analysisModel: 'anthropic/claude-sonnet-4.6',
  language: 'en',
  reduceBleed: true
}

/** Model ids that are no longer valid on OpenRouter; mapped to the default. */
export const DEPRECATED_MODEL_IDS = new Set<string>(['anthropic/claude-3.7-sonnet'])
