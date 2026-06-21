import { useCallback, useRef, useState } from 'react'
import { CaptureError, getMicStream, getSystemStream } from '../lib/capture'
import { WavRecorder } from '../lib/wav-recorder'

export type RecorderPhase = 'idle' | 'arming' | 'recording' | 'saving' | 'error'

export interface RecorderState {
  phase: RecorderPhase
  elapsed: number
  error: string | null
}

export interface UseRecorder extends RecorderState {
  start: (micDeviceId?: string) => Promise<void>
  stop: () => Promise<{ interviewId: string; durationSec: number } | null>
  micLevel: () => number
  systemLevel: () => number
  reset: () => void
}

export function useRecorder(): UseRecorder {
  const [phase, setPhase] = useState<RecorderPhase>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const micRec = useRef<WavRecorder | null>(null)
  const sysRec = useRef<WavRecorder | null>(null)
  const micStream = useRef<MediaStream | null>(null)
  const sysStream = useRef<MediaStream | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const cleanup = useCallback((): void => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    micStream.current?.getTracks().forEach((t) => t.stop())
    sysStream.current?.getTracks().forEach((t) => t.stop())
    micStream.current = null
    sysStream.current = null
  }, [])

  const start = useCallback(async (micDeviceId?: string): Promise<void> => {
    setError(null)
    setPhase('arming')
    try {
      await window.api.requestMicPermission()
      const mic = await getMicStream(micDeviceId)
      const sys = await getSystemStream()
      micStream.current = mic
      sysStream.current = sys

      const mr = new WavRecorder(mic)
      const sr = new WavRecorder(sys)
      await mr.start()
      await sr.start()
      micRec.current = mr
      sysRec.current = sr

      setElapsed(0)
      timer.current = setInterval(() => setElapsed((e) => e + 1), 1000)
      setPhase('recording')
    } catch (err) {
      cleanup()
      setError(err instanceof CaptureError ? err.message : (err as Error).message)
      setPhase('error')
    }
  }, [cleanup])

  const stop = useCallback(async (): Promise<
    { interviewId: string; durationSec: number } | null
  > => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    setPhase('saving')
    try {
      const interviewId = await window.api.createInterview()
      const mic = await micRec.current!.stop()
      const sys = await sysRec.current!.stop()
      cleanup()

      await window.api.saveTrack({ interviewId, source: 'mic', bytes: mic.bytes })
      await window.api.saveTrack({ interviewId, source: 'system', bytes: sys.bytes })

      const durationSec = Math.max(mic.durationSec, sys.durationSec)
      setPhase('idle')
      return { interviewId, durationSec }
    } catch (err) {
      setError((err as Error).message)
      setPhase('error')
      return null
    }
  }, [cleanup])

  const reset = useCallback((): void => {
    cleanup()
    setPhase('idle')
    setElapsed(0)
    setError(null)
  }, [cleanup])

  return {
    phase,
    elapsed,
    error,
    start,
    stop,
    micLevel: () => micRec.current?.level() ?? 0,
    systemLevel: () => sysRec.current?.level() ?? 0,
    reset
  }
}
