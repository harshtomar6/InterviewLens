import { app, BrowserWindow, desktopCapturer, nativeTheme, session, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpc } from './ipc'
import { handleTrackScheme, registerTrackScheme } from './audio/track-protocol'

// Privileged scheme registration MUST run before app 'ready'.
registerTrackScheme()

const TITLEBAR_HEIGHT = 46

// Caption-bar colors for the Windows Controls Overlay, matched to the content
// titlebar region per theme.
function overlayColors(): { color: string; symbolColor: string } {
  return nativeTheme.shouldUseDarkColors
    ? { color: '#171920', symbolColor: '#edeff3' }
    : { color: '#f3f4f6', symbolColor: '#1b1d23' }
}

function createWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const isWin = process.platform === 'win32'

  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 940,
    minHeight: 660,
    show: false,
    autoHideMenuBar: true,
    title: 'InterviewLens',
    // Integrated title bar so the window has no separate OS chrome bar above the
    // app — the #1 thing that makes Electron apps read as "web page in a window".
    //  - macOS: hiddenInset keeps the traffic lights inset over our sidebar.
    //  - Windows: hidden + Controls Overlay restores native min/max/close buttons
    //    (plain 'hidden' would leave the window with NO controls).
    //  - Linux: keep the native frame for guaranteed window controls.
    titleBarStyle: isMac ? 'hiddenInset' : isWin ? 'hidden' : 'default',
    trafficLightPosition: isMac ? { x: 14, y: 18 } : undefined,
    titleBarOverlay: isWin ? { ...overlayColors(), height: TITLEBAR_HEIGHT } : undefined,
    // Frosted native macOS material behind the (translucent) sidebar.
    vibrancy: isMac ? 'sidebar' : undefined,
    visualEffectState: 'active',
    // No opaque bg on mac (it would hide the vibrancy); theme-matched solid
    // fallback on platforms without vibrancy so the sidebar base is correct.
    backgroundColor: isMac ? '#00000000' : nativeTheme.shouldUseDarkColors ? '#0f1115' : '#e9eaee',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // Follow OS light/dark changes on platforms using the solid fallback / overlay.
  if (!isMac) {
    nativeTheme.on('updated', () => {
      if (win.isDestroyed()) return
      win.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#0f1115' : '#e9eaee')
      if (isWin) win.setTitleBarOverlay({ ...overlayColors(), height: TITLEBAR_HEIGHT })
    })
  }

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
