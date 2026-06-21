import { useEffect, useMemo, useState, type JSX } from 'react'
import type { Interview, InterviewMeta } from '@shared/types'
import { RoleAvatar } from '../components/RoleAvatar'
import { StatusBadge } from '../components/StatusBadge'
import { ErrorNotice } from '../components/ErrorNotice'
import { dayBucket, formatDuration, formatFull, formatRelative, type DayBucket } from '../lib/format'

interface Props {
  onOpen: (interview: Interview) => void
  onNew: () => void
  onRetryTranscription: (meta: InterviewMeta) => void
}

type Filter = 'all' | 'interviewer' | 'candidate' | 'errors'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'interviewer', label: 'Interviewer' },
  { key: 'candidate', label: 'Candidate' },
  { key: 'errors', label: 'Errors' }
]

const BUCKET_ORDER: DayBucket[] = ['Today', 'Yesterday', 'Earlier this week', 'Earlier']

export function LibraryScreen({ onOpen, onNew, onRetryTranscription }: Props): JSX.Element {
  const [items, setItems] = useState<InterviewMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

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
    setConfirmId(null)
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((it) => {
      if (filter === 'errors' && it.status !== 'error') return false
      if ((filter === 'interviewer' || filter === 'candidate') && it.role !== filter) return false
      if (!q) return true
      return (
        it.role.includes(q) ||
        it.status.includes(q) ||
        formatRelative(it.createdAt).toLowerCase().includes(q) ||
        formatFull(it.createdAt).toLowerCase().includes(q)
      )
    })
  }, [items, filter, query])

  const groups = useMemo(() => {
    const map = new Map<DayBucket, InterviewMeta[]>()
    for (const it of filtered) {
      const b = dayBucket(it.createdAt)
      const arr = map.get(b) ?? []
      arr.push(it)
      map.set(b, arr)
    }
    return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({ bucket: b, items: map.get(b)! }))
  }, [filtered])

  const renderCard = (it: InterviewMeta): JSX.Element => {
    const openable = it.status === 'complete' || it.hasTranscript
    const failedAnalysis = it.status === 'error' && it.hasTranscript
    const failedTranscription = it.status === 'error' && !it.hasTranscript
    const roleLabel = it.role === 'interviewer' ? 'Interviewer' : 'Candidate'

    return (
      <div
        key={it.id}
        className={`lib-card ${openable ? 'clickable' : ''}`}
        onClick={() => openable && busyId !== it.id && void open(it.id)}
      >
        <RoleAvatar role={it.role} />
        <div className="lib-body">
          <div className="lib-row1">
            <span className="lib-when" title={formatFull(it.createdAt)}>
              {formatRelative(it.createdAt)}
            </span>
            <StatusBadge status={it.status} />
          </div>
          <div className="lib-row2">
            {roleLabel} · {formatDuration(it.durationSec)}
          </div>
          {it.status === 'error' && (
            <ErrorNotice error={it.error} phase={failedAnalysis ? 'analysis' : 'transcription'} />
          )}
        </div>

        <div className="lib-actions" onClick={(e) => e.stopPropagation()}>
          {busyId === it.id ? (
            <span className="hint">Running…</span>
          ) : (
            <>
              {failedTranscription && (
                <button className="btn small primary" onClick={() => onRetryTranscription(it)}>
                  Run transcription
                </button>
              )}
              {failedAnalysis && (
                <button className="btn small primary" onClick={() => void runAnalysis(it.id)}>
                  Run analysis
                </button>
              )}
              {openable && (
                <button className="btn small" onClick={() => void open(it.id)}>
                  Open
                </button>
              )}
              {confirmId === it.id ? (
                <span className="confirm-del">
                  Delete?
                  <button className="icon-btn danger" title="Confirm" onClick={() => void remove(it.id)}>✓</button>
                  <button className="icon-btn" title="Cancel" onClick={() => setConfirmId(null)}>✕</button>
                </span>
              ) : (
                <button className="icon-btn del" title="Delete" onClick={() => setConfirmId(it.id)}>
                  🗑
                </button>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="screen library">
      <div className="library-head">
        <div className="library-title">
          <h1>Library</h1>
          {!loading && <span className="count">{items.length} interview{items.length === 1 ? '' : 's'}</span>}
        </div>
        <button className="btn primary" onClick={onNew}>+ New interview</button>
      </div>

      {error && <p className="error">{error}</p>}

      {items.length > 0 && (
        <div className="library-controls">
          <div className="search">
            <span className="search-ico">⌕</span>
            <input
              type="text"
              placeholder="Search interviews…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="chips">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={`chip ${filter === f.key ? 'active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="library-list">
          {[0, 1, 2].map((i) => (
            <div key={i} className="lib-card skeleton">
              <div className="sk-avatar" />
              <div className="sk-body">
                <div className="sk-line w40" />
                <div className="sk-line w24" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="empty-state">
          <div className="empty-ico">🎙</div>
          <h2>No interviews yet</h2>
          <p>Record your first interview to see it here.</p>
          <button className="btn primary" onClick={onNew}>+ New interview</button>
        </div>
      )}

      {!loading && items.length > 0 && filtered.length === 0 && (
        <p className="hint">No interviews match your search.</p>
      )}

      {!loading &&
        groups.map((g) => (
          <div key={g.bucket} className="lib-group">
            <div className="lib-group-label">{g.bucket}</div>
            <div className="library-list">{g.items.map(renderCard)}</div>
          </div>
        ))}
    </div>
  )
}
