import type { RawSegment } from '../openrouter/stt'
import type { Transcript, TranscriptSegment, UserRole } from '@shared/types'
import { labelForTrack } from '@shared/roles'

/**
 * Tag each track's segments with the correct speaker label (derived purely from
 * the user's role) and interleave both tracks into one transcript sorted by
 * start time. No diarization — the track IS the speaker.
 */
export function mergeTranscript(
  userRole: UserRole,
  micSegments: RawSegment[],
  systemSegments: RawSegment[]
): Transcript {
  const micLabel = labelForTrack(userRole, 'mic')
  const sysLabel = labelForTrack(userRole, 'system')

  const tagged: TranscriptSegment[] = [
    ...micSegments.map((s) => ({ ...s, source: 'mic' as const, speaker: micLabel })),
    ...systemSegments.map((s) => ({ ...s, source: 'system' as const, speaker: sysLabel }))
  ]

  tagged.sort((a, b) => a.start - b.start || a.end - b.end)
  return { segments: tagged }
}

/** Render a transcript as readable "[mm:ss] Speaker: text" lines for the LLM. */
export function formatTranscript(transcript: Transcript): string {
  return transcript.segments
    .map((s) => `[${ts(s.start)}] ${s.speaker}: ${s.text}`)
    .join('\n')
}

function ts(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
