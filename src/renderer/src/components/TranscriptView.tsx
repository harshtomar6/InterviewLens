import type { JSX } from 'react'
import type { Transcript } from '@shared/types'

function ts(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export function TranscriptView({ transcript }: { transcript: Transcript }): JSX.Element {
  if (transcript.segments.length === 0) {
    return <p className="hint">No speech segments.</p>
  }
  return (
    <div className="transcript">
      {transcript.segments.map((seg, i) => (
        <div key={i} className={`utterance ${seg.source}`}>
          <div className="utterance-head">
            <span className="speaker">{seg.speaker}</span>
            <span className="time">{ts(seg.start)}</span>
          </div>
          <p>{seg.text}</p>
        </div>
      ))}
    </div>
  )
}
