import { useEffect, useState, type JSX } from 'react'
import type { Interview, InterviewMeta } from '@shared/types'

interface Props {
  onOpen: (interview: Interview) => void
  onNew: () => void
  onRetryTranscription: (meta: InterviewMeta) => void
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString()
}

export function LibraryScreen({ onOpen, onNew, onRetryTranscription }: Props): JSX.Element {
  const [items, setItems] = useState<InterviewMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    setLoading(true)
    try {
      setItems(await window.api.listInterviews())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const open = async (id: string): Promise<void> => {
    const full = await window.api.getInterview(id)
    if (full) onOpen(full)
  }

  const remove = async (id: string): Promise<void> => {
    await window.api.deleteInterview(id)
    void load()
  }

  const runAnalysis = async (id: string): Promise<void> => {
    setBusyId(id)
    setError(null)
    try {
      await window.api.analyzeInterview(id)
      const full = await window.api.getInterview(id)
      if (full) onOpen(full)
    } catch (err) {
      setError((err as Error).message)
      void load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="screen">
      <div className="results-head">
        <h1>Library</h1>
        <button className="btn primary" onClick={onNew}>+ New interview</button>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="hint">Loading…</p>}
      {!loading && items.length === 0 && (
        <p className="hint">No interviews yet. Record your first one.</p>
      )}

      <div className="library-list">
        {items.map((it) => {
          const openable = it.status === 'complete' || it.hasTranscript
          const failedAnalysis = it.status === 'error' && it.hasTranscript
          const failedTranscription = it.status === 'error' && !it.hasTranscript
          return (
            <div key={it.id} className="library-row">
              <div className="lib-main" onClick={() => openable && void open(it.id)}>
                <div className="lib-title">{it.title}</div>
                <div className="lib-meta">
                  <span className={`badge ${it.role}`}>{it.role}</span>
                  <span>{fmtDate(it.createdAt)}</span>
                  <span>{Math.round(it.durationSec)}s</span>
                  <span className={`status ${it.status}`}>{it.status}</span>
                  {failedAnalysis && <span className="status">· transcript saved</span>}
                </div>
                {it.status === 'error' && it.error && <div className="lib-error">{it.error}</div>}
              </div>

              {busyId === it.id ? (
                <span className="hint">Running…</span>
              ) : (
                <>
                  {failedTranscription && (
                    <button className="btn small" onClick={() => onRetryTranscription(it)}>
                      Run transcription
                    </button>
                  )}
                  {failedAnalysis && (
                    <button className="btn small primary" onClick={() => void runAnalysis(it.id)}>
                      Run analysis
                    </button>
                  )}
                  <button className="btn small" onClick={() => void open(it.id)} disabled={!openable}>
                    Open
                  </button>
                </>
              )}
              <button className="btn small danger-ghost" onClick={() => void remove(it.id)} disabled={busyId === it.id}>
                Delete
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
