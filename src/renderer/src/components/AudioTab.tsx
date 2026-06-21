import { useEffect, useState, type JSX } from 'react'
import type { Interview, TrackSource } from '@shared/types'
import { labelForTrack } from '@shared/roles'

interface Props {
  interview: Interview
}

const SOURCES: TrackSource[] = ['mic', 'system']

export function AudioTab({ interview }: Props): JSX.Element {
  const [urls, setUrls] = useState<Record<TrackSource, string>>({ mic: '', system: '' })
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async (): Promise<void> => {
      const entries = await Promise.all(
        SOURCES.map(async (s) => [s, await window.api.trackUrl(interview.id, s)] as const)
      )
      if (!cancelled) setUrls(Object.fromEntries(entries) as Record<TrackSource, string>)
    })()
    return () => {
      cancelled = true
    }
  }, [interview.id])

  const exportTrack = async (source: TrackSource): Promise<void> => {
    setStatus(null)
    try {
      const path = await window.api.exportTrack(interview.id, source)
      if (path) setStatus(`Exported to ${path}`)
    } catch (err) {
      setStatus((err as Error).message)
    }
  }

  return (
    <div className="audio-tab">
      <p className="hint">
        Two separate tracks were recorded — yours (mic) and the other person’s (system loopback).
        Play or export each as a standalone WAV.
      </p>

      {SOURCES.map((source) => {
        const speaker = labelForTrack(interview.role, source)
        return (
          <div key={source} className="track-card">
            <div className="track-card-head">
              <div>
                <strong>{speaker}</strong>
                <span className="track-source">{source === 'mic' ? 'your microphone' : 'system audio'}</span>
              </div>
              <button className="btn small" onClick={() => void exportTrack(source)}>
                Export .wav
              </button>
            </div>
            {urls[source] && (
              <audio controls preload="none" src={urls[source]} className="track-audio" />
            )}
          </div>
        )
      })}

      {status && <p className="hint">{status}</p>}
      <button className="btn" onClick={() => window.api.revealRecordingsDir()}>
        Open recordings folder
      </button>
    </div>
  )
}
