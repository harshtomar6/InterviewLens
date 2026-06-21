import { useEffect, useRef, type JSX } from 'react'
import { useRecorder } from '../hooks/useRecorder'
import { LevelMeter } from '../components/LevelMeter'

interface Props {
  micDeviceId: string | undefined
  onStopped: (interviewId: string, durationSec: number) => void
  onCancel: () => void
}

function fmt(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function RecordScreen({ micDeviceId, onStopped, onCancel }: Props): JSX.Element {
  const rec = useRecorder()
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    void rec.start(micDeviceId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stop = async (): Promise<void> => {
    const result = await rec.stop()
    if (result) onStopped(result.interviewId, result.durationSec)
  }

  return (
    <div className="screen record-screen">
      <h1>Recording</h1>

      {rec.phase === 'arming' && <p className="subtitle">Acquiring microphone & system audio…</p>}
      {rec.phase === 'error' && (
        <>
          <p className="error">{rec.error}</p>
          <div className="actions">
            <button className="btn" onClick={onCancel}>← Back to pre-flight</button>
            <button className="btn primary" onClick={() => { started.current = false; void rec.start(micDeviceId) }}>
              Retry
            </button>
          </div>
        </>
      )}

      {(rec.phase === 'recording' || rec.phase === 'saving') && (
        <>
          <div className={`record-dot ${rec.phase === 'recording' ? 'live' : ''}`} />
          <div className="big-timer">{fmt(rec.elapsed)}</div>

          <div className="meters wide">
            <LevelMeter label="You (mic)" active={rec.phase === 'recording'} getLevel={rec.micLevel} />
            <LevelMeter
              label="Other person (system)"
              active={rec.phase === 'recording'}
              getLevel={rec.systemLevel}
            />
          </div>

          {rec.phase === 'recording' ? (
            <button className="btn danger lg round" onClick={() => void stop()}>
              ■ Stop & process
            </button>
          ) : (
            <p className="subtitle">Saving recording…</p>
          )}
          <p className="hint">Two separate WAV tracks are being recorded — yours and theirs.</p>
        </>
      )}
    </div>
  )
}
