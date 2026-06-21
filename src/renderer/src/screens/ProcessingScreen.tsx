import { useEffect, useRef, useState, type JSX } from 'react'
import type { Interview, PipelineProgress, PipelineStage, UserRole } from '@shared/types'

interface Props {
  interviewId: string
  role: UserRole
  /** The work to run (new recording vs. retry). Returns the finished interview. */
  run: () => Promise<Interview>
  onComplete: (interview: Interview) => void
  onError: (message: string) => void
}

const STAGES: { key: PipelineStage; label: string }[] = [
  { key: 'resample', label: 'Resample to 16 kHz mono' },
  { key: 'vad', label: 'Detect speech (drop silence)' },
  { key: 'chunk', label: 'Chunk into <50s segments' },
  { key: 'transcribe', label: 'Transcribe via OpenRouter' },
  { key: 'merge', label: 'Merge & label by speaker' },
  { key: 'analyze', label: 'Generate role-specific analysis' }
]

export function ProcessingScreen({
  interviewId,
  role,
  run,
  onComplete,
  onError
}: Props): JSX.Element {
  const [progress, setProgress] = useState<PipelineProgress | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    const off = window.api.onPipelineProgress((p) => {
      if (p.interviewId === interviewId) setProgress(p)
    })
    if (!startedRef.current) {
      startedRef.current = true
      void run()
        .then(onComplete)
        .catch((err: Error) => onError(err.message))
    }
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewId])

  const activeIndex = progress
    ? STAGES.findIndex((s) => s.key === progress.stage)
    : -1

  return (
    <div className="screen">
      <h1>Processing</h1>
      <p className="subtitle">
        {role === 'interviewer' ? 'Evaluating the candidate' : 'Coaching your answers'} — this can
        take a couple of minutes for long interviews.
      </p>

      <ol className="stage-list">
        {STAGES.map((s, i) => {
          const done = activeIndex > i || progress?.stage === 'done'
          const active = activeIndex === i && progress?.stage !== 'done'
          return (
            <li key={s.key} className={done ? 'done' : active ? 'active' : ''}>
              <span className="bullet">{done ? '✓' : active ? '●' : '○'}</span>
              <span className="stage-label">{s.label}</span>
              {active && progress?.detail && <span className="stage-detail">{progress.detail}</span>}
              {active && progress?.fraction != null && (
                <div className="stage-bar">
                  <div style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
