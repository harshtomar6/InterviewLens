import { useEffect, useRef, useState, type JSX } from 'react'
import { CaptureError, getMicStream, getSystemStream, listMicDevices } from '../lib/capture'
import { WavRecorder } from '../lib/wav-recorder'
import { LevelMeter } from '../components/LevelMeter'
import type { EnvInfo, PermissionState } from '../../../main/permissions'

interface Props {
  onBack: () => void
  onStart: (micDeviceId: string | undefined) => void
}

export function PreflightScreen({ onBack, onStart }: Props): JSX.Element {
  const [env, setEnv] = useState<EnvInfo | null>(null)
  const [perms, setPerms] = useState<PermissionState | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [micId, setMicId] = useState<string | undefined>(undefined)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)

  const micRec = useRef<WavRecorder | null>(null)
  const sysRec = useRef<WavRecorder | null>(null)
  const streams = useRef<MediaStream[]>([])

  useEffect(() => {
    void window.api.getEnvInfo().then(setEnv)
    // Proactively trigger the mic prompt on entry. Screen Recording has no
    // programmatic prompt — it only fires on the first getDisplayMedia call
    // (the "Test levels" button below).
    void window.api.requestMicPermission().finally(() => void refreshPerms())
    return () => stopTest()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshPerms = async (): Promise<void> => {
    setPerms(await window.api.checkPermissions())
    try {
      setDevices(await listMicDevices())
    } catch {
      /* labels need permission; ignore */
    }
  }

  const stopTest = (): void => {
    void micRec.current?.stop()
    void sysRec.current?.stop()
    micRec.current = null
    sysRec.current = null
    streams.current.forEach((s) => s.getTracks().forEach((t) => t.stop()))
    streams.current = []
  }

  const startTest = async (): Promise<void> => {
    setError(null)
    try {
      await window.api.requestMicPermission()
      const mic = await getMicStream(micId)
      const sys = await getSystemStream()
      streams.current = [mic, sys]
      const mr = new WavRecorder(mic)
      const sr = new WavRecorder(sys)
      await mr.start()
      await sr.start()
      micRec.current = mr
      sysRec.current = sr
      setTesting(true)
      void refreshPerms()
    } catch (err) {
      setError(err instanceof CaptureError ? err.message : (err as Error).message)
      void refreshPerms()
    }
  }

  const endTest = (): void => {
    stopTest()
    setTesting(false)
  }

  const proceed = (): void => {
    stopTest()
    onStart(micId)
  }

  const micOk = perms?.microphone === 'granted'
  const screenOk = perms?.screen === 'granted'

  return (
    <div className="screen">
      <h1>Pre-flight check</h1>
      <p className="subtitle">Confirm both tracks capture before you record.</p>

      {env?.loopbackWarning && <p className="warn">{env.loopbackWarning}</p>}

      <section className="card">
        <h2>Permissions</h2>
        <ul className="kv">
          <li>
            <span>Microphone</span>
            <code className={micOk ? 'ok' : 'bad'}>{perms?.microphone ?? '…'}</code>
          </li>
          <li>
            <span>Screen recording (system audio)</span>
            <code className={screenOk ? 'ok' : 'bad'}>{perms?.screen ?? '…'}</code>
          </li>
        </ul>
        {!screenOk && (
          <p className="hint">
            macOS requires Screen Recording permission for system-audio loopback. It only prompts
            on the first <strong>Test levels</strong> click — and never re-prompts once denied. If
            it won't prompt, enable it manually below, then <strong>quit and relaunch</strong> the
            app.
          </p>
        )}
        <div className="actions">
          <button className="btn" onClick={() => void refreshPerms()}>Re-check</button>
          {!micOk && (
            <button className="btn" onClick={() => void window.api.openSystemPrefs('microphone')}>
              Open Microphone settings
            </button>
          )}
          {!screenOk && (
            <button className="btn" onClick={() => void window.api.openSystemPrefs('screen')}>
              Open Screen Recording settings
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Microphone</h2>
        <select value={micId ?? ''} onChange={(e) => setMicId(e.target.value || undefined)}>
          <option value="">System default</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
            </option>
          ))}
        </select>

        <div className="meters">
          <LevelMeter label="Mic (you)" active={testing} getLevel={() => micRec.current?.level() ?? 0} />
          <LevelMeter
            label="System (other person)"
            active={testing}
            getLevel={() => sysRec.current?.level() ?? 0}
          />
        </div>
        {!testing ? (
          <button className="btn" onClick={() => void startTest()}>Test levels</button>
        ) : (
          <button className="btn" onClick={endTest}>Stop test</button>
        )}
        {error && <p className="error">{error}</p>}
        <p className="hint">
          Play the call/audio so the <strong>System</strong> meter moves. Loopback captures
          <strong> all</strong> system audio — mute music & notifications now.
        </p>
        <p className="hint">
          🎧 <strong>Use headphones.</strong> On speakers, the other person’s voice plays out loud
          and bleeds into your mic track. Echo cancellation reduces this, but headphones eliminate
          it — keeping the two speaker tracks cleanly separated.
        </p>
      </section>

      <section className="card consent">
        <h2>Consent</h2>
        <p>
          Recording another person may require their consent. Many places have{' '}
          <strong>two-party consent</strong> laws. Make sure everyone on the call knows they are
          being recorded.
        </p>
        <label className="checkbox">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          I have consent from everyone being recorded.
        </label>
      </section>

      <div className="actions">
        <button className="btn" onClick={() => { stopTest(); onBack() }}>← Back</button>
        <button className="btn primary lg" disabled={!consent} onClick={proceed}>
          Start recording →
        </button>
      </div>
    </div>
  )
}
