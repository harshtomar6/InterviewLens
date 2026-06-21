// The single choice that drives the whole app: who is the user?
// It resolves (1) speaker labels per audio track and (2) the analysis lens.

export type UserRole = 'interviewer' | 'candidate'

// Which physical track maps to which spoken role.
export type TrackSource = 'mic' | 'system'

export type SpeakerLabel = 'Interviewer' | 'Candidate'

/**
 * Mic is ALWAYS the user; system/loopback is ALWAYS the other person.
 * So labels are a pure function of (userRole, trackSource) — no diarization.
 */
export function labelForTrack(userRole: UserRole, source: TrackSource): SpeakerLabel {
  const userIs: SpeakerLabel = userRole === 'interviewer' ? 'Interviewer' : 'Candidate'
  const otherIs: SpeakerLabel = userRole === 'interviewer' ? 'Candidate' : 'Interviewer'
  return source === 'mic' ? userIs : otherIs
}

export function describeRole(userRole: UserRole): string {
  return userRole === 'interviewer'
    ? 'You are the INTERVIEWER. Your mic is the interviewer; system audio is the candidate.'
    : 'You are the CANDIDATE. Your mic is the candidate; system audio is the interviewer.'
}
