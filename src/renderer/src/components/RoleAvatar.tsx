import type { JSX } from 'react'
import type { UserRole } from '@shared/types'

interface Props {
  role: UserRole
  size?: number
}

// Role-colored avatar. The mic glyph + tint reads as "an interview by <role>".
export function RoleAvatar({ role, size = 40 }: Props): JSX.Element {
  return (
    <div
      className={`role-avatar ${role}`}
      style={{ width: size, height: size, fontSize: size * 0.46 }}
      title={role === 'interviewer' ? 'Interviewer' : 'Candidate'}
      aria-label={role}
    >
      🎙
    </div>
  )
}
