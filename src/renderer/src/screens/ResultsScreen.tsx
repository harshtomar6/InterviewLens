import { useState, type JSX } from 'react'
import type { Interview } from '@shared/types'
import { Markdown } from '../components/Markdown'
import { TranscriptView } from '../components/TranscriptView'
import { ChatBox } from '../components/ChatBox'
import { AudioTab } from '../components/AudioTab'

interface Props {
  interview: Interview
  onBack: () => void
}

type Tab = 'analysis' | 'transcript' | 'audio' | 'ask'

export function ResultsScreen({ interview: initial, onBack }: Props): JSX.Element {
  const [interview, setInterview] = useState(initial)
  const [tab, setTab] = useState<Tab>('analysis')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const lens = interview.role === 'interviewer' ? 'Candidate evaluation' : 'Your coaching report'

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

  const reanalyze = async (): Promise<void> => {
    setBusy(true)
    setStatus('Re-running analysis…')
    try {
      const md = await window.api.analyzeInterview(interview.id)
      setInterview({ ...interview, analysisMarkdown: md })
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
        <div>
          <h1>{interview.title}</h1>
          <span className={`badge ${interview.role}`}>{interview.role}</span>
          <span className="lens-label">{lens}</span>
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
        {tab === 'analysis' && (
          <div className="analysis-pane">
            {interview.analysisMarkdown ? (
              <Markdown source={interview.analysisMarkdown} />
            ) : (
              <p className="hint">No analysis yet — analysis may have failed. Run it below.</p>
            )}
            <button className="btn" onClick={() => void reanalyze()} disabled={busy}>
              {interview.analysisMarkdown ? 'Re-run analysis with current model' : 'Run analysis'}
            </button>
          </div>
        )}
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
