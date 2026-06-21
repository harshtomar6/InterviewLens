import { useState, type JSX } from 'react'
import type { Interview, InterviewMeta, UserRole } from '@shared/types'
import { SetupScreen } from './screens/SetupScreen'
import { PreflightScreen } from './screens/PreflightScreen'
import { RecordScreen } from './screens/RecordScreen'
import { ProcessingScreen } from './screens/ProcessingScreen'
import { ResultsScreen } from './screens/ResultsScreen'
import { LibraryScreen } from './screens/LibraryScreen'

type View = 'setup' | 'preflight' | 'record' | 'processing' | 'results' | 'library'

interface Session {
  role: UserRole
  jobDescription: string
}

interface ProcJob {
  interviewId: string
  role: UserRole
  run: () => Promise<Interview>
}

const FLOW: { view: View; label: string }[] = [
  { view: 'setup', label: 'Set up' },
  { view: 'preflight', label: 'Pre-flight' },
  { view: 'record', label: 'Record' },
  { view: 'processing', label: 'Process' },
  { view: 'results', label: 'Results' }
]

const TITLES: Record<View, string> = {
  setup: 'New interview',
  preflight: 'Pre-flight check',
  record: 'Recording',
  processing: 'Processing',
  results: 'Results',
  library: 'Library'
}

export default function App(): JSX.Element {
  const [view, setView] = useState<View>('setup')
  const [session, setSession] = useState<Session>({ role: 'interviewer', jobDescription: '' })
  const [micDeviceId, setMicDeviceId] = useState<string | undefined>(undefined)
  const [proc, setProc] = useState<ProcJob | null>(null)
  const [active, setActive] = useState<Interview | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

  const goLibrary = (): void => {
    setActive(null)
    setView('library')
  }
  const goNew = (): void => {
    setBanner(null)
    setActive(null)
    setView('setup')
  }

  const inFlow = view !== 'library'
  const flowIndex = FLOW.findIndex((f) => f.view === view)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-drag" />
        <div className="sidebar-brand">
          <span className="brand-mark">🎙️</span>
          <span className="brand-name">InterviewLens</span>
        </div>

        <nav className="sidebar-nav">
          <button className={`nav-item ${inFlow ? 'active' : ''}`} onClick={goNew}>
            <span className="nav-ico">＋</span> New interview
          </button>
          <button className={`nav-item ${view === 'library' ? 'active' : ''}`} onClick={goLibrary}>
            <span className="nav-ico">▤</span> Library
          </button>
        </nav>

        {inFlow && (
          <ol className="flow-rail">
            {FLOW.map((f, i) => (
              <li
                key={f.view}
                className={i < flowIndex ? 'past' : i === flowIndex ? 'current' : 'future'}
              >
                <span className="dot" />
                {f.label}
              </li>
            ))}
          </ol>
        )}

        <div className="sidebar-footer">
          <button className="link-btn" onClick={() => window.api.revealRecordingsDir()}>
            Recordings folder
          </button>
        </div>
      </aside>

      <section className="content">
        <header className="titlebar">
          <span className="titlebar-title">{TITLES[view]}</span>
        </header>

        {banner && (
          <div className="banner error" onClick={() => setBanner(null)}>
            <span>{banner}</span>
            <span className="dismiss">✕</span>
          </div>
        )}

        <div className="content-scroll">
          {view === 'setup' && (
            <SetupScreen
              onContinue={(role, jobDescription) => {
                setSession({ role, jobDescription })
                setView('preflight')
              }}
            />
          )}

          {view === 'preflight' && (
            <PreflightScreen
              onBack={() => setView('setup')}
              onStart={(id) => {
                setMicDeviceId(id)
                setView('record')
              }}
            />
          )}

          {view === 'record' && (
            <RecordScreen
              micDeviceId={micDeviceId}
              onCancel={() => setView('preflight')}
              onStopped={(interviewId, durationSec) => {
                setProc({
                  interviewId,
                  role: session.role,
                  run: () =>
                    window.api.processInterview({
                      interviewId,
                      role: session.role,
                      jobDescription: session.jobDescription,
                      durationSec
                    })
                })
                setView('processing')
              }}
            />
          )}

          {view === 'processing' && proc && (
            <ProcessingScreen
              interviewId={proc.interviewId}
              role={proc.role}
              run={proc.run}
              onComplete={(interview) => {
                setActive(interview)
                setView('results')
              }}
              onError={(message) => {
                setBanner(`Processing failed: ${message}`)
                setView('library')
              }}
            />
          )}

          {view === 'results' && active && <ResultsScreen interview={active} onBack={goLibrary} />}

          {view === 'library' && (
            <LibraryScreen
              onOpen={(interview) => {
                setActive(interview)
                setView('results')
              }}
              onNew={goNew}
              onRetryTranscription={(meta: InterviewMeta) => {
                setBanner(null)
                setProc({
                  interviewId: meta.id,
                  role: meta.role,
                  run: () => window.api.retryTranscription(meta.id)
                })
                setView('processing')
              }}
            />
          )}
        </div>
      </section>
    </div>
  )
}
