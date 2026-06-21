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

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" onClick={() => setView(active ? 'results' : 'library')}>
          🎙️ InterviewLens
        </div>
        <nav>
          <button className="btn small" onClick={() => { setBanner(null); setView('setup') }}>
            New interview
          </button>
          <button className="btn small" onClick={goLibrary}>Library</button>
        </nav>
      </header>

      {banner && (
        <div className="banner error" onClick={() => setBanner(null)}>
          {banner} <span className="dismiss">✕</span>
        </div>
      )}

      <main>
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

        {view === 'results' && active && (
          <ResultsScreen interview={active} onBack={goLibrary} />
        )}

        {view === 'library' && (
          <LibraryScreen
            onOpen={(interview) => {
              setActive(interview)
              setView('results')
            }}
            onNew={() => setView('setup')}
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
      </main>
    </div>
  )
}
