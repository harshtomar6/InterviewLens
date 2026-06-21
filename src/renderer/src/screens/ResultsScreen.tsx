import { useState, type JSX } from 'react'
import type { Interview, UserRole } from '@shared/types'
import { Markdown } from '../components/Markdown'
import { TranscriptView } from '../components/TranscriptView'
import { ChatBox } from '../components/ChatBox'
import { AudioTab } from '../components/AudioTab'
import { RoleAvatar } from '../components/RoleAvatar'
import { StatusBadge } from '../components/StatusBadge'
import { ErrorNotice } from '../components/ErrorNotice'
import { EditableTitle } from '../components/EditableTitle'
import { formatDuration, formatFull, formatRelative } from '../lib/format'

interface Props {
  interview: Interview
  onBack: () => void
}

type Tab = 'analysis' | 'transcript' | 'audio' | 'ask'

export function ResultsScreen({ interview: initial, onBack }: Props): JSX.Element {
  const [interview, setInterview] = useState(initial)
  const [tab, setTab] = useState<Tab>('analysis')
  const [perspective, setPerspective] = useState<UserRole>(initial.role)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const roleLabel = interview.role === 'interviewer' ? 'Interviewer' : 'Candidate'
  const lens = interview.role === 'interviewer' ? 'Candidate evaluation' : 'Your coaching report'

  const PERSPECTIVES: { key: UserRole; label: string; hint: string }[] = [
    { key: 'interviewer', label: 'Interviewer lens', hint: 'Evaluate the candidate' },
    { key: 'candidate', label: 'Candidate lens', hint: 'Coach the answers' }
  ]

  const exportAs = async (kind: 'md' | 'pdf'): Promise<void> => {
    setStatus(null)
    try {
      const path =
        kind === 'md'
          ? await window.api.exportMarkdown(interview.id)
          : await window.api.exportPdf(interview.id)
      if (path) setStatus(`Exported to ${path}`)
    } catch (err) {
      setStatus((err as Error).message)
    }
  }

  const generate = async (lensRole: UserRole): Promise<void> => {
    setBusy(true)
    setStatus(`Generating ${lensRole} analysis…`)
    try {
      const md = await window.api.analyzeInterview(interview.id, lensRole)
      setInterview((prev) => ({
        ...prev,
        status: 'complete',
        error: undefined,
        analyses: { ...prev.analyses, [lensRole]: md }
      }))
      setStatus('Analysis updated ✓')
    } catch (err) {
      setStatus((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen results">
      <div className="results-head">
        <div className="results-ident">
          <RoleAvatar role={interview.role} size={44} />
          <div className="results-meta">
            <div className="title-line">
              <EditableTitle
                value={interview.title}
                tag="h1"
                onSave={async (title) => {
                  const saved = await window.api.renameInterview(interview.id, title)
                  setInterview({ ...interview, title: saved })
                }}
              />
              <StatusBadge status={interview.status} />
            </div>
            <div className="results-sub">
              <span>{roleLabel}</span>
              <span>·</span>
              <span title={formatFull(interview.createdAt)}>{formatRelative(interview.createdAt)}</span>
              <span>·</span>
              <span>{formatDuration(interview.durationSec)}</span>
              <span>·</span>
              <span className="lens-label">{lens}</span>
            </div>
          </div>
        </div>
        <div className="results-actions">
          <button className="btn" onClick={() => void exportAs('md')}>Export .md</button>
          <button className="btn" onClick={() => void exportAs('pdf')}>Export .pdf</button>
          <button className="btn" onClick={onBack}>Library</button>
        </div>
      </div>
      {status && <p className="hint">{status}</p>}

      <div className="tabs">
        <button className={tab === 'analysis' ? 'active' : ''} onClick={() => setTab('analysis')}>
          Analysis
        </button>
        <button className={tab === 'transcript' ? 'active' : ''} onClick={() => setTab('transcript')}>
          Transcript
        </button>
        <button className={tab === 'audio' ? 'active' : ''} onClick={() => setTab('audio')}>
          Audio
        </button>
        <button className={tab === 'ask' ? 'active' : ''} onClick={() => setTab('ask')}>
          Ask follow-ups
        </button>
      </div>

      <div className="tab-body">
        {tab === 'analysis' &&
          (() => {
            const current = interview.analyses[perspective]
            const isPrimary = perspective === interview.role
            const primaryFailed = isPrimary && interview.status === 'error' && !current
            const meta = PERSPECTIVES.find((p) => p.key === perspective)!
            return (
              <div className="analysis-pane">
                <div className="perspective-switch">
                  <div className="seg">
                    {PERSPECTIVES.map((p) => (
                      <button
                        key={p.key}
                        className={perspective === p.key ? 'active' : ''}
                        onClick={() => setPerspective(p.key)}
                        title={p.hint}
                      >
                        {p.label}
                        {interview.analyses[p.key] && <span className="seg-dot">●</span>}
                      </button>
                    ))}
                  </div>
                  <span className="perspective-note">
                    {isPrimary
                      ? `Native lens · recorded as ${roleLabel.toLowerCase()}`
                      : 'Alternate lens · same transcript, different report'}
                  </span>
                </div>

                {current ? (
                  <>
                    <div className="report">
                      <Markdown source={current} />
                    </div>
                    <button className="btn" onClick={() => void generate(perspective)} disabled={busy}>
                      Re-run {meta.label.toLowerCase()}
                    </button>
                  </>
                ) : primaryFailed ? (
                  <>
                    <ErrorNotice error={interview.error} phase="analysis" />
                    <button className="btn primary" onClick={() => void generate(perspective)} disabled={busy}>
                      Retry analysis
                    </button>
                  </>
                ) : (
                  <div className="generate-prompt">
                    <p className="hint">
                      No {meta.label.toLowerCase()} analysis yet — {meta.hint.toLowerCase()} from the
                      same transcript.
                    </p>
                    <button className="btn primary" onClick={() => void generate(perspective)} disabled={busy}>
                      {busy ? 'Generating…' : `Generate ${meta.label.toLowerCase()}`}
                    </button>
                  </div>
                )}
              </div>
            )
          })()}
        {tab === 'transcript' &&
          (interview.transcript ? (
            <TranscriptView transcript={interview.transcript} />
          ) : (
            <p className="hint">No transcript available.</p>
          ))}
        {tab === 'audio' && <AudioTab interview={interview} />}
        {tab === 'ask' && <ChatBox interviewId={interview.id} />}
      </div>
    </div>
  )
}
