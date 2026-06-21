import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type { EnvInfo, PermissionState } from '../main/permissions'
import type {
  AppSettings,
  ChatMessage,
  ChatThread,
  Interview,
  InterviewMeta,
  PipelineProgress,
  SaveTrackPayload,
  TrackSource,
  UserRole
} from '@shared/types'

const api = {
  // environment / permissions
  getEnvInfo: (): Promise<EnvInfo> => ipcRenderer.invoke(IPC.getEnvInfo),
  checkPermissions: (): Promise<PermissionState> => ipcRenderer.invoke(IPC.checkPermissions),
  requestMicPermission: (): Promise<boolean> => ipcRenderer.invoke(IPC.requestMicPermission),
  openSystemPrefs: (kind: 'microphone' | 'screen'): Promise<void> =>
    ipcRenderer.invoke(IPC.openSystemPrefs, kind),

  // recording
  createInterview: (): Promise<string> => ipcRenderer.invoke(IPC.createInterview),
  saveTrack: (p: SaveTrackPayload): Promise<{ path: string; size: number }> =>
    ipcRenderer.invoke(IPC.saveTrack, p),
  finalizeRecording: (
    interviewId: string
  ): Promise<{
    interviewId: string
    tracks: { source: TrackSource; path: string; size: number }[]
  }> => ipcRenderer.invoke(IPC.finalizeRecording, interviewId),

  // processing
  processInterview: (p: {
    interviewId: string
    role: UserRole
    jobDescription: string
    durationSec: number
    title?: string
  }): Promise<Interview> => ipcRenderer.invoke(IPC.processInterview, p),
  retryTranscription: (interviewId: string): Promise<Interview> =>
    ipcRenderer.invoke(IPC.retryTranscription, interviewId),
  onPipelineProgress: (cb: (p: PipelineProgress) => void): (() => void) => {
    const listener = (_e: unknown, p: PipelineProgress): void => cb(p)
    ipcRenderer.on(IPC.pipelineProgress, listener)
    return () => ipcRenderer.removeListener(IPC.pipelineProgress, listener)
  },

  // analysis / chat
  analyzeInterview: (id: string): Promise<string> => ipcRenderer.invoke(IPC.analyzeInterview, id),
  createChatThread: (interviewId: string, title: string): Promise<ChatThread> =>
    ipcRenderer.invoke(IPC.createChatThread, interviewId, title),
  listChatThreads: (interviewId: string): Promise<ChatThread[]> =>
    ipcRenderer.invoke(IPC.listChatThreads, interviewId),
  getChatThread: (threadId: string): Promise<ChatThread | null> =>
    ipcRenderer.invoke(IPC.getChatThread, threadId),
  chatSend: (threadId: string, question: string): Promise<ChatMessage[]> =>
    ipcRenderer.invoke(IPC.chatSend, threadId, question),

  // library
  listInterviews: (): Promise<InterviewMeta[]> => ipcRenderer.invoke(IPC.listInterviews),
  getInterview: (id: string): Promise<Interview | null> => ipcRenderer.invoke(IPC.getInterview, id),
  deleteInterview: (id: string): Promise<void> => ipcRenderer.invoke(IPC.deleteInterview, id),

  // settings / keys
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (p: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke(IPC.setSettings, p),
  setApiKey: (key: string): Promise<boolean> => ipcRenderer.invoke(IPC.setApiKey, key),
  testApiKey: (): Promise<boolean> => ipcRenderer.invoke(IPC.testApiKey),

  // export / misc
  exportMarkdown: (id: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC.exportMarkdown, id),
  exportPdf: (id: string): Promise<string | null> => ipcRenderer.invoke(IPC.exportPdf, id),
  exportTrack: (id: string, source: TrackSource): Promise<string | null> =>
    ipcRenderer.invoke(IPC.exportTrack, id, source),
  trackUrl: (id: string, source: TrackSource): Promise<string> =>
    ipcRenderer.invoke(IPC.trackUrl, id, source),
  revealRecordingsDir: (): Promise<void> => ipcRenderer.invoke(IPC.revealRecordingsDir)
}

export type InterviewLensApi = typeof api

contextBridge.exposeInMainWorld('api', api)
