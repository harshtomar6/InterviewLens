import { useEffect, useState, type JSX } from 'react'
import type { AppSettings, UserRole } from '@shared/types'

interface Props {
  onContinue: (role: UserRole, jobDescription: string) => void
}

export function SetupScreen({ onContinue }: Props): JSX.Element {
  const [role, setRole] = useState<UserRole>('interviewer')
  const [jd, setJd] = useState('')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [keyStatus, setKeyStatus] = useState<string | null>(null)
  const [sttModel, setSttModel] = useState('')
  const [analysisModel, setAnalysisModel] = useState('')
  const [language, setLanguage] = useState('en')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.api.getSettings().then((s) => {
      setSettings(s)
      setSttModel(s.sttModel)
      setAnalysisModel(s.analysisModel)
      setLanguage(s.language)
    })
  }, [])

  const saveKey = async (): Promise<void> => {
    if (!apiKey.trim()) return
    setBusy(true)
    setKeyStatus('Saving & testing…')
    try {
      await window.api.setApiKey(apiKey.trim())
      const ok = await window.api.testApiKey()
      setKeyStatus(ok ? 'Key saved and verified ✓' : 'Key saved, but verification failed — check it.')
      setSettings(await window.api.getSettings())
      setApiKey('')
    } catch (err) {
      setKeyStatus((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const saveModels = async (): Promise<void> => {
    setSettings(await window.api.setSettings({ sttModel, analysisModel }))
  }

  const toggleBleed = async (reduceBleed: boolean): Promise<void> => {
    setSettings(await window.api.setSettings({ reduceBleed }))
  }

  const saveLanguage = async (): Promise<void> => {
    setSettings(await window.api.setSettings({ language }))
  }

  const hasKey = settings?.hasApiKey ?? false

  return (
    <div className="screen">
      <h1>Set up your interview</h1>
      <p className="subtitle">One choice drives everything: which side are you on?</p>

      <section className="card">
        <h2>1 · Your role</h2>
        <div className="role-pick">
          <button
            className={`role-card ${role === 'interviewer' ? 'selected' : ''}`}
            onClick={() => setRole('interviewer')}
          >
            <strong>Interviewer</strong>
            <span>Evaluate the candidate against the job. Decision-support.</span>
          </button>
          <button
            className={`role-card ${role === 'candidate' ? 'selected' : ''}`}
            onClick={() => setRole('candidate')}
          >
            <strong>Candidate</strong>
            <span>Coach me: answers, structure, clarity, phrasing.</span>
          </button>
        </div>
        <p className="hint">
          Your mic = you. System audio = the other person. Labels and the analysis lens follow
          automatically.
        </p>
      </section>

      <section className="card">
        <h2>2 · Job description <span className="optional">(optional)</span></h2>
        <textarea
          className="jd"
          rows={6}
          placeholder="Paste the role's job description to ground the analysis…"
          value={jd}
          onChange={(e) => setJd(e.target.value)}
        />
      </section>

      <section className="card">
        <h2>3 · OpenRouter API key</h2>
        {hasKey ? (
          <p className="ok-note">A key is stored in your OS keychain ✓ — re-enter below to replace it.</p>
        ) : (
          <p className="hint">
            Get one at <code>openrouter.ai/keys</code>. Stored locally in your OS keychain, never
            sent anywhere except OpenRouter.
          </p>
        )}
        <div className="key-row">
          <input
            type="password"
            placeholder="sk-or-…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <button className="btn" onClick={() => void saveKey()} disabled={busy || !apiKey.trim()}>
            Save key
          </button>
        </div>
        {keyStatus && <p className="hint">{keyStatus}</p>}

        <details className="models">
          <summary>Models</summary>
          <label>
            Transcription model
            <input value={sttModel} onChange={(e) => setSttModel(e.target.value)} onBlur={() => void saveModels()} />
          </label>
          <label>
            Analysis model
            <input value={analysisModel} onChange={(e) => setAnalysisModel(e.target.value)} onBlur={() => void saveModels()} />
          </label>
        </details>
      </section>

      <section className="card">
        <h2>4 · Audio &amp; transcription</h2>
        <label className="models-field">
          Spoken language
          <input
            value={language}
            placeholder="en (blank = auto-detect)"
            onChange={(e) => setLanguage(e.target.value)}
            onBlur={() => void saveLanguage()}
          />
        </label>
        <p className="hint">
          ISO-639-1 code (e.g. <code>en</code>, <code>hi</code>, <code>es</code>). Setting this
          stops the transcriber from drifting into the wrong language on quiet chunks. Leave blank
          only for mixed-language calls.
        </p>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings?.reduceBleed ?? true}
            onChange={(e) => void toggleBleed(e.target.checked)}
          />
          Reduce speaker bleed in my mic track
        </label>
        <p className="hint">
          Ducks your mic whenever the other person is talking, removing their voice from your track
          when you record on speakers. Leave on unless you wear headphones (then it’s harmless).
        </p>
      </section>

      <div className="actions">
        <button
          className="btn primary lg"
          disabled={!hasKey}
          onClick={() => onContinue(role, jd)}
          title={hasKey ? '' : 'Add your OpenRouter API key first'}
        >
          Continue to pre-flight →
        </button>
        {!hasKey && <span className="hint">Add an API key to continue.</span>}
      </div>
    </div>
  )
}
