import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type {
  ChatMessage,
  ChatThread,
  Interview,
  InterviewMeta,
  Transcript
} from '@shared/types'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db
  const path = join(app.getPath('userData'), 'interviewlens.db')
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS interviews (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      role TEXT NOT NULL,
      job_description TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      duration_sec REAL NOT NULL DEFAULT 0,
      error TEXT,
      mic_wav_path TEXT NOT NULL,
      system_wav_path TEXT NOT NULL,
      transcript_json TEXT,
      analysis_markdown TEXT
    );
    CREATE TABLE IF NOT EXISTS chat_threads (
      id TEXT PRIMARY KEY,
      interview_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_threads_interview ON chat_threads(interview_id);
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON chat_messages(thread_id);

    CREATE TABLE IF NOT EXISTS analyses (
      interview_id TEXT NOT NULL,
      perspective TEXT NOT NULL,
      markdown TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (interview_id, perspective),
      FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE
    );

    -- Migrate any pre-existing single analysis into the per-perspective table,
    -- under the recording's own role. Idempotent.
    INSERT OR IGNORE INTO analyses (interview_id, perspective, markdown, created_at)
      SELECT id, role, analysis_markdown, created_at
      FROM interviews WHERE analysis_markdown IS NOT NULL;
  `)
  return db
}

function analysesFor(interviewId: string): Record<'interviewer' | 'candidate', string | null> {
  const rows = getDb()
    .prepare('SELECT perspective, markdown FROM analyses WHERE interview_id = ?')
    .all(interviewId) as { perspective: string; markdown: string }[]
  const map: Record<'interviewer' | 'candidate', string | null> = {
    interviewer: null,
    candidate: null
  }
  for (const r of rows) {
    if (r.perspective === 'interviewer' || r.perspective === 'candidate') {
      map[r.perspective] = r.markdown
    }
  }
  return map
}

export function setAnalysis(
  interviewId: string,
  perspective: 'interviewer' | 'candidate',
  markdown: string
): void {
  getDb()
    .prepare(
      `INSERT INTO analyses (interview_id, perspective, markdown, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(interview_id, perspective)
       DO UPDATE SET markdown = excluded.markdown, created_at = excluded.created_at`
    )
    .run(interviewId, perspective, markdown, Date.now())
}

interface InterviewRow {
  id: string
  title: string
  role: string
  job_description: string
  created_at: number
  status: string
  duration_sec: number
  error: string | null
  mic_wav_path: string
  system_wav_path: string
  transcript_json: string | null
  analysis_markdown: string | null
}

function rowToInterview(r: InterviewRow): Interview {
  return {
    id: r.id,
    title: r.title,
    role: r.role as Interview['role'],
    jobDescription: r.job_description,
    createdAt: r.created_at,
    status: r.status as Interview['status'],
    durationSec: r.duration_sec,
    error: r.error ?? undefined,
    hasTranscript: r.transcript_json != null,
    micWavPath: r.mic_wav_path,
    systemWavPath: r.system_wav_path,
    transcript: r.transcript_json ? (JSON.parse(r.transcript_json) as Transcript) : null,
    analyses: analysesFor(r.id)
  }
}

export interface CreateInterviewInput {
  id: string
  title: string
  role: Interview['role']
  jobDescription: string
  micWavPath: string
  systemWavPath: string
  durationSec: number
}

export function insertInterview(input: CreateInterviewInput): void {
  getDb()
    .prepare(
      `INSERT INTO interviews
       (id, title, role, job_description, created_at, status, duration_sec, mic_wav_path, system_wav_path)
       VALUES (@id, @title, @role, @jobDescription, @createdAt, 'processing', @durationSec, @micWavPath, @systemWavPath)`
    )
    .run({ ...input, createdAt: Date.now() })
}

export function updateInterview(
  id: string,
  fields: Partial<{
    title: string
    status: Interview['status']
    error: string | null
    transcript: Transcript | null
    durationSec: number
  }>
): void {
  const sets: string[] = []
  const params: Record<string, unknown> = { id }
  if (fields.title !== undefined) {
    sets.push('title = @title')
    params.title = fields.title
  }
  if (fields.status !== undefined) {
    sets.push('status = @status')
    params.status = fields.status
  }
  if (fields.error !== undefined) {
    sets.push('error = @error')
    params.error = fields.error
  }
  if (fields.transcript !== undefined) {
    sets.push('transcript_json = @transcript')
    params.transcript = fields.transcript ? JSON.stringify(fields.transcript) : null
  }
  if (fields.durationSec !== undefined) {
    sets.push('duration_sec = @durationSec')
    params.durationSec = fields.durationSec
  }
  if (sets.length === 0) return
  getDb()
    .prepare(`UPDATE interviews SET ${sets.join(', ')} WHERE id = @id`)
    .run(params)
}

export function getInterview(id: string): Interview | null {
  const row = getDb()
    .prepare('SELECT * FROM interviews WHERE id = ?')
    .get(id) as InterviewRow | undefined
  return row ? rowToInterview(row) : null
}

export function listInterviews(): InterviewMeta[] {
  const rows = getDb()
    .prepare(
      `SELECT id, title, role, job_description, created_at, status, duration_sec, error,
              (transcript_json IS NOT NULL) AS has_transcript
       FROM interviews ORDER BY created_at DESC`
    )
    .all() as (Omit<
    InterviewRow,
    'mic_wav_path' | 'system_wav_path' | 'transcript_json' | 'analysis_markdown'
  > & { has_transcript: number })[]
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    role: r.role as InterviewMeta['role'],
    jobDescription: r.job_description,
    createdAt: r.created_at,
    status: r.status as InterviewMeta['status'],
    durationSec: r.duration_sec,
    error: r.error ?? undefined,
    hasTranscript: r.has_transcript === 1
  }))
}

export function deleteInterview(id: string): void {
  getDb().prepare('DELETE FROM interviews WHERE id = ?').run(id)
}

// ---- chat threads ----

export function createThread(interviewId: string, title: string): ChatThread {
  const id = randomUUID()
  const createdAt = Date.now()
  getDb()
    .prepare(
      'INSERT INTO chat_threads (id, interview_id, title, created_at) VALUES (?, ?, ?, ?)'
    )
    .run(id, interviewId, title, createdAt)
  return { id, interviewId, title, createdAt, messages: [] }
}

export function appendMessage(threadId: string, msg: ChatMessage): void {
  getDb()
    .prepare(
      'INSERT INTO chat_messages (thread_id, role, content, created_at) VALUES (?, ?, ?, ?)'
    )
    .run(threadId, msg.role, msg.content, Date.now())
}

export function getThread(threadId: string): ChatThread | null {
  const t = getDb()
    .prepare('SELECT * FROM chat_threads WHERE id = ?')
    .get(threadId) as
    | { id: string; interview_id: string; title: string; created_at: number }
    | undefined
  if (!t) return null
  const messages = getDb()
    .prepare('SELECT role, content FROM chat_messages WHERE thread_id = ? ORDER BY id ASC')
    .all(threadId) as ChatMessage[]
  return {
    id: t.id,
    interviewId: t.interview_id,
    title: t.title,
    createdAt: t.created_at,
    messages
  }
}

export function listThreads(interviewId: string): ChatThread[] {
  const rows = getDb()
    .prepare(
      'SELECT * FROM chat_threads WHERE interview_id = ? ORDER BY created_at DESC'
    )
    .all(interviewId) as {
    id: string
    interview_id: string
    title: string
    created_at: number
  }[]
  return rows.map((t) => ({
    id: t.id,
    interviewId: t.interview_id,
    title: t.title,
    createdAt: t.created_at,
    messages: []
  }))
}
