import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  AppSettings,
  ChatMessage,
  PipelineProgress,
  SaveTrackPayload,
  TrackSource,
  UserRole
} from '@shared/types'
import {
  checkPermissions,
  getEnvInfo,
  openPrivacySettings,
  requestMicPermission
} from './permissions'
import {
  deleteInterviewDir,
  ensureInterviewDir,
  fileSize,
  newInterviewId,
  revealRecordingsDir,
  trackPath,
  writeTrack
} from './store/files'
import {
  appendMessage,
  createThread,
  deleteInterview as dbDeleteInterview,
  getInterview,
  getThread,
  insertInterview,
  listInterviews,
  listThreads,
  setAnalysis,
  updateInterview
} from './store/db'
import { deleteApiKey, hasApiKey, setApiKey } from './store/keys'
import { readSettings, writeSettings } from './store/settings'
import { testApiKey } from './openrouter/client'
import { transcribeTracks } from './pipeline/orchestrator'
import { buildAnalysisMessages, buildChatMessages } from './analysis/prompts'
import { chatComplete } from './openrouter/chat'
import { exportMarkdown, exportPdf, exportTrack } from './export'
import { trackUrl } from './audio/track-protocol'

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Wrap a handler so thrown errors reach the renderer with a clean message. */
function handle<T>(
  channel: string,
  fn: (event: IpcMainInvokeEvent, ...args: never[]) => Promise<T> | T
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(event, ...(args as never[]))
    } catch (err) {
      throw new Error(describeError(err))
    }
  })
}

export function registerIpc(): void {
  // --- environment / permissions ---
  handle(IPC.getEnvInfo, () => getEnvInfo())
  handle(IPC.checkPermissions, () => checkPermissions())
  handle(IPC.requestMicPermission, () => requestMicPermission())
  handle(IPC.openSystemPrefs, (_e, kind: 'microphone' | 'screen') =>
    openPrivacySettings(kind)
  )

  // --- recording lifecycle ---
  handle(IPC.createInterview, async () => {
    const id = newInterviewId()
    await ensureInterviewDir(id)
    return id
  })

  handle(IPC.saveTrack, async (_e, payload: SaveTrackPayload) => {
    if (!payload?.interviewId) throw new Error('saveTrack: missing interviewId')
    const path = await writeTrack(payload.interviewId, payload.source, payload.bytes)
    return { path, size: await fileSize(path) }
  })

  handle(IPC.finalizeRecording, async (_e, interviewId: string) => {
    const sources: TrackSource[] = ['mic', 'system']
    const tracks = await Promise.all(
      sources.map(async (source) => {
        const path = trackPath(interviewId, source)
        return { source, path, size: await fileSize(path) }
      })
    )
    return { interviewId, tracks }
  })

  // --- processing pipeline ---

  /**
   * Run transcription then analysis for an interview that already has a DB row.
   * The transcript is PERSISTED as soon as it is built — so if analysis fails,
   * the interview keeps its transcript and analysis can be retried on its own.
   */
  async function runFullPipeline(interviewId: string, event: IpcMainInvokeEvent): Promise<void> {
    const interview = getInterview(interviewId)
    if (!interview) throw new Error('Interview not found')
    const settings = await readSettings()
    const onProgress = (p: PipelineProgress): void => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC.pipelineProgress, p)
    }

    updateInterview(interviewId, { status: 'processing', error: null })

    // Phase 1 — transcription. Persist the transcript immediately on success.
    const transcript = await transcribeTracks(
      {
        interviewId,
        role: interview.role,
        jobDescription: interview.jobDescription,
        micWavPath: interview.micWavPath,
        systemWavPath: interview.systemWavPath,
        sttModel: settings.sttModel,
        language: settings.language,
        reduceBleed: settings.reduceBleed
      },
      onProgress
    )
    updateInterview(interviewId, { transcript })

    // Phase 2 — analysis from the recording's own perspective. A failure here
    // leaves the transcript intact (other perspectives are generated on demand).
    onProgress({ interviewId, stage: 'analyze', detail: 'Generating role-specific analysis' })
    const messages = buildAnalysisMessages(interview.role, interview.jobDescription, transcript)
    const analysisMarkdown = await chatComplete(settings.analysisModel, messages, {
      temperature: 0.3,
      maxTokens: 4000
    })
    setAnalysis(interviewId, interview.role, analysisMarkdown)
    updateInterview(interviewId, { status: 'complete', error: null })
    onProgress({ interviewId, stage: 'done', detail: 'Complete' })
  }

  handle(
    IPC.processInterview,
    async (
      event,
      payload: {
        interviewId: string
        role: UserRole
        jobDescription: string
        durationSec: number
        title?: string
      }
    ) => {
      const { interviewId, role, jobDescription, durationSec } = payload
      const title =
        payload.title?.trim() ||
        `${role === 'interviewer' ? 'Interviewer' : 'Candidate'} interview`

      insertInterview({
        id: interviewId,
        title,
        role,
        jobDescription,
        micWavPath: trackPath(interviewId, 'mic'),
        systemWavPath: trackPath(interviewId, 'system'),
        durationSec
      })

      try {
        await runFullPipeline(interviewId, event)
        return getInterview(interviewId)
      } catch (err) {
        const msg = describeError(err)
        updateInterview(interviewId, { status: 'error', error: msg })
        throw new Error(msg)
      }
    }
  )

  // Re-run the full pipeline (transcription + analysis) for a failed interview
  // whose transcription never completed. Reuses the stored role/job/paths.
  handle(IPC.retryTranscription, async (event, interviewId: string) => {
    try {
      await runFullPipeline(interviewId, event)
      return getInterview(interviewId)
    } catch (err) {
      const msg = describeError(err)
      updateInterview(interviewId, { status: 'error', error: msg })
      throw new Error(msg)
    }
  })

  // Generate (or regenerate) the analysis for a given PERSPECTIVE — the
  // recording role by default, or the opposite lens on demand. Same transcript,
  // different prompt. Requires a stored transcript.
  handle(
    IPC.analyzeInterview,
    async (_e, interviewId: string, perspective?: UserRole) => {
      const interview = getInterview(interviewId)
      if (!interview) throw new Error('Interview not found')
      if (!interview.transcript) throw new Error('Interview has no transcript to analyze')
      const lens: UserRole = perspective ?? interview.role
      const settings = await readSettings()
      const messages = buildAnalysisMessages(lens, interview.jobDescription, interview.transcript)
      try {
        const analysisMarkdown = await chatComplete(settings.analysisModel, messages, {
          temperature: 0.3,
          maxTokens: 4000
        })
        setAnalysis(interviewId, lens, analysisMarkdown)
        // Generating the recording-role analysis clears a prior failure.
        if (interview.status === 'error') {
          updateInterview(interviewId, { status: 'complete', error: null })
        }
        return analysisMarkdown
      } catch (err) {
        const msg = describeError(err)
        // Only flag the interview itself as errored if its primary lens failed.
        if (lens === interview.role && !interview.analyses[interview.role]) {
          updateInterview(interviewId, { status: 'error', error: msg })
        }
        throw new Error(msg)
      }
    }
  )

  // --- ask-later chat ---
  handle(IPC.createChatThread, (_e, interviewId: string, title: string) =>
    createThread(interviewId, title)
  )
  handle(IPC.listChatThreads, (_e, interviewId: string) => listThreads(interviewId))
  handle(IPC.getChatThread, (_e, threadId: string) => getThread(threadId))

  handle(IPC.chatSend, async (_e, threadId: string, question: string) => {
    const thread = getThread(threadId)
    if (!thread) throw new Error('Chat thread not found')
    const interview = getInterview(thread.interviewId)
    if (!interview || !interview.transcript) {
      throw new Error('Interview transcript unavailable for this chat')
    }
    const settings = await readSettings()
    const messages = buildChatMessages(
      interview.role,
      interview.jobDescription,
      interview.transcript,
      thread.messages,
      question
    )
    const answer = await chatComplete(settings.analysisModel, messages)
    appendMessage(threadId, { role: 'user', content: question })
    appendMessage(threadId, { role: 'assistant', content: answer })
    const updated = getThread(threadId)
    return updated?.messages ?? ([] as ChatMessage[])
  })

  // --- library / persistence ---
  handle(IPC.listInterviews, () => listInterviews())
  handle(IPC.getInterview, (_e, id: string) => getInterview(id))
  handle(IPC.deleteInterview, async (_e, id: string) => {
    dbDeleteInterview(id)
    await deleteInterviewDir(id)
  })
  handle(IPC.renameInterview, (_e, id: string, title: string) => {
    const trimmed = title.trim().slice(0, 120)
    if (!trimmed) throw new Error('Title cannot be empty')
    updateInterview(id, { title: trimmed })
    return trimmed
  })

  // --- settings / keys ---
  handle(IPC.getSettings, async (): Promise<AppSettings> => {
    const s = await readSettings()
    return { ...s, hasApiKey: await hasApiKey() }
  })
  handle(IPC.setSettings, async (_e, partial: Partial<AppSettings>) => {
    const s = await writeSettings(partial)
    return { ...s, hasApiKey: await hasApiKey() }
  })
  handle(IPC.setApiKey, async (_e, key: string) => {
    if (!key || !key.trim()) {
      await deleteApiKey()
      return false
    }
    await setApiKey(key)
    return true
  })
  handle(IPC.testApiKey, () => testApiKey())

  // --- export / misc ---
  handle(IPC.exportMarkdown, (_e, id: string) => {
    const interview = getInterview(id)
    if (!interview) throw new Error('Interview not found')
    return exportMarkdown(interview)
  })
  handle(IPC.exportPdf, (_e, id: string) => {
    const interview = getInterview(id)
    if (!interview) throw new Error('Interview not found')
    return exportPdf(interview)
  })
  handle(IPC.exportTrack, (_e, id: string, source: TrackSource) => {
    const interview = getInterview(id)
    if (!interview) throw new Error('Interview not found')
    return exportTrack(interview, source)
  })
  handle(IPC.trackUrl, (_e, id: string, source: TrackSource) => trackUrl(id, source))
  handle(IPC.revealRecordingsDir, () => revealRecordingsDir())
}
