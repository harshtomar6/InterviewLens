import { describe, it, expect } from 'vitest'
import { labelForTrack } from './roles'

describe('labelForTrack', () => {
  it('interviewer: mic is Interviewer, system is Candidate', () => {
    expect(labelForTrack('interviewer', 'mic')).toBe('Interviewer')
    expect(labelForTrack('interviewer', 'system')).toBe('Candidate')
  })

  it('candidate: labels swap', () => {
    expect(labelForTrack('candidate', 'mic')).toBe('Candidate')
    expect(labelForTrack('candidate', 'system')).toBe('Interviewer')
  })
})
