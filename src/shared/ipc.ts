// Single source of truth for IPC channel names, shared by main + preload.

export const IPC = {
  // environment / permissions
  getEnvInfo: 'env:getInfo',
  checkPermissions: 'perm:check',
  requestMicPermission: 'perm:requestMic',
  openSystemPrefs: 'perm:openSystemPrefs',

  // recording lifecycle
  createInterview: 'rec:create',
  saveTrack: 'rec:saveTrack',
  finalizeRecording: 'rec:finalize',

  // processing pipeline
  processInterview: 'pipeline:process',
  retryTranscription: 'pipeline:retryTranscription',
  pipelineProgress: 'pipeline:progress', // main -> renderer (event)

  // analysis / chat
  analyzeInterview: 'analysis:run',
  chatSend: 'chat:send',

  // library / persistence
  listInterviews: 'lib:list',
  getInterview: 'lib:get',
  deleteInterview: 'lib:delete',
  listChatThreads: 'chat:listThreads',
  getChatThread: 'chat:getThread',
  createChatThread: 'chat:createThread',

  // settings / keys
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  setApiKey: 'settings:setApiKey',
  testApiKey: 'settings:testApiKey',

  // export / misc
  exportMarkdown: 'export:markdown',
  exportPdf: 'export:pdf',
  exportTrack: 'export:track',
  trackUrl: 'audio:trackUrl',
  openPath: 'misc:openPath',
  revealRecordingsDir: 'misc:revealRecordings'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
