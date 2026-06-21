import type { JSX } from 'react'
import type { InterviewStatus } from '@shared/types'

const MAP: Record<InterviewStatus, { label: string; cls: string; icon: string }> = {
  complete: { label: 'Complete', cls: 'ok', icon: '✓' },
  processing: { label: 'Processing', cls: 'warn', icon: '●' },
  recording: { label: 'Recording', cls: 'warn', icon: '●' },
  error: { label: 'Error', cls: 'bad', icon: '⚠' }
}

export function StatusBadge({ status }: { status: InterviewStatus }): JSX.Element {
  const s = MAP[status]
  return (
    <span className={`status-badge ${s.cls} ${status === 'processing' ? 'pulsing' : ''}`}>
      <span className="status-dot">{s.icon}</span>
      {s.label}
    </span>
  )
}
