import { describe, it, expect } from 'vitest'
import { mergeTranscript, formatTranscript } from './merge'
import type { RawSegment } from '../openrouter/stt'

const mic: RawSegment[] = [
  { start: 0, end: 3, text: 'Tell me about yourself.' },
  { start: 10, end: 12, text: 'Good, and your weaknesses?' }
]
const system: RawSegment[] = [
  { start: 3.5, end: 9, text: 'I led a team of five engineers.' }
]

describe('mergeTranscript', () => {
  it('interleaves both tracks sorted by start time', () => {
    const t = mergeTranscript('interviewer', mic, system)
    expect(t.segments.map((s) => s.start)).toEqual([0, 3.5, 10])
  })

  it('labels mic as Interviewer and system as Candidate in interviewer mode', () => {
    const t = mergeTranscript('interviewer', mic, system)
    expect(t.segments[0]?.speaker).toBe('Interviewer')
    expect(t.segments[1]?.speaker).toBe('Candidate')
  })

  it('swaps labels in candidate mode', () => {
    const t = mergeTranscript('candidate', mic, system)
    expect(t.segments[0]?.speaker).toBe('Candidate')
    expect(t.segments[1]?.speaker).toBe('Interviewer')
  })

  it('formats with timestamps and speaker', () => {
    const t = mergeTranscript('interviewer', mic, system)
    expect(formatTranscript(t)).toContain('[00:00] Interviewer: Tell me about yourself.')
    expect(formatTranscript(t)).toContain('[00:03] Candidate: I led a team of five engineers.')
  })
})
