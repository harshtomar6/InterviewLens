import { app, shell } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { TrackSource } from '@shared/types'

/** Root folder holding all interview data: <userData>/recordings/<id>/ */
export function recordingsRoot(): string {
  return join(app.getPath('userData'), 'recordings')
}

export function interviewDir(id: string): string {
  return join(recordingsRoot(), id)
}

export function trackPath(id: string, source: TrackSource): string {
  return join(interviewDir(id), `${source}.wav`)
}

export function processedTrackPath(id: string, source: TrackSource): string {
  return join(interviewDir(id), `${source}.16k.wav`)
}

/** Bleed-reduced mic track (mic ducked against the system track). */
export function cleanedMicPath(id: string): string {
  return join(interviewDir(id), 'mic.clean.16k.wav')
}

export function chunksDir(id: string, source: TrackSource): string {
  return join(interviewDir(id), 'chunks', source)
}

export function newInterviewId(): string {
  return randomUUID()
}

export async function ensureInterviewDir(id: string): Promise<string> {
  const dir = interviewDir(id)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

export async function writeTrack(
  id: string,
  source: TrackSource,
  bytes: ArrayBuffer
): Promise<string> {
  await ensureInterviewDir(id)
  const path = trackPath(id, source)
  await fs.writeFile(path, Buffer.from(bytes))
  return path
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

export async function fileSize(path: string): Promise<number> {
  try {
    const st = await fs.stat(path)
    return st.size
  } catch {
    return 0
  }
}

export async function deleteInterviewDir(id: string): Promise<void> {
  await fs.rm(interviewDir(id), { recursive: true, force: true })
}

export async function revealRecordingsDir(): Promise<void> {
  const root = recordingsRoot()
  await fs.mkdir(root, { recursive: true })
  shell.openPath(root)
}
