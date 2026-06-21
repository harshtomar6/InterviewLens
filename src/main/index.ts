import { app, BrowserWindow, desktopCapturer, session, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpc } from './ipc'
import { handleTrackScheme, registerTrackScheme } from './audio/track-protocol'

// Privileged scheme registration MUST run before app 'ready'.
registerTrackScheme()

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'InterviewLens',
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

/**
 * THE system-audio loopback grant. Without this, getDisplayMedia({ audio: true })
 * in the renderer returns no audio track and capture silently fails.
 *
 * Electron REQUIRES a real video source here — `video: undefined` throws
 * "video must be a WebFrameMain or DesktopCapturerSource". So we fetch a screen
 * source via desktopCapturer (which is also what triggers the macOS Screen
 * Recording permission prompt) and pair it with `audio: 'loopback'`. The renderer
 * immediately stops + removes the video track; we only keep the system audio.
 */
function installDisplayMediaHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => {
          const screen = sources[0]
          if (!screen) {
            // No source available (permission denied / no display) -> deny the
            // request so the renderer surfaces a clear "system-denied" error.
            callback({})
            return
          }
          callback({ video: screen, audio: 'loopback' })
        })
        .catch(() => callback({}))
    },
    // useSystemPicker:false — we never want the OS source picker for audio loopback.
    { useSystemPicker: false }
  )
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.interviewlens.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  installDisplayMediaHandler()
  handleTrackScheme()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
