import { shell, systemPreferences } from 'electron'
import { release } from 'os'

export interface EnvInfo {
  platform: NodeJS.Platform
  /** macOS product version, e.g. "13.2.1" — empty on non-mac. */
  macVersion: string
  /** True when the OS supports system-audio loopback (macOS 13.2+). */
  loopbackSupported: boolean
  loopbackWarning: string | null
}

export interface PermissionState {
  // 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'
  microphone: string
  /** Screen capture access governs system-audio loopback on macOS. */
  screen: string
}

function parseMacVersion(): string {
  if (process.platform !== 'darwin') return ''
  // os.release() returns the Darwin kernel version, not the product version,
  // but Electron exposes the product version mapping via process.
  // Fall back to Darwin->macOS heuristic only if needed.
  // process.getSystemVersion() is the reliable product version.
  const anyProcess = process as unknown as { getSystemVersion?: () => string }
  if (typeof anyProcess.getSystemVersion === 'function') {
    return anyProcess.getSystemVersion()
  }
  return release()
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da - db
  }
  return 0
}

export function getEnvInfo(): EnvInfo {
  const platform = process.platform
  const macVersion = parseMacVersion()

  if (platform !== 'darwin') {
    return {
      platform,
      macVersion,
      loopbackSupported: true,
      loopbackWarning:
        platform === 'win32'
          ? null
          : 'System-audio loopback is only verified on macOS and Windows.'
    }
  }

  const supported = compareVersions(macVersion, '13.2') >= 0
  return {
    platform,
    macVersion,
    loopbackSupported: supported,
    loopbackWarning: supported
      ? null
      : `System-audio capture needs macOS 13.2 or newer (you have ${macVersion}). The other person's audio cannot be recorded on this version.`
  }
}

export function checkPermissions(): PermissionState {
  if (process.platform !== 'darwin') {
    return { microphone: 'granted', screen: 'granted' }
  }
  return {
    microphone: systemPreferences.getMediaAccessStatus('microphone'),
    screen: systemPreferences.getMediaAccessStatus('screen')
  }
}

export async function requestMicPermission(): Promise<boolean> {
  if (process.platform !== 'darwin') return true
  try {
    return await systemPreferences.askForMediaAccess('microphone')
  } catch {
    return false
  }
}

/**
 * Open the relevant macOS Privacy & Security pane. There is no programmatic API
 * to trigger the Screen Recording prompt — it only fires on the first
 * getDisplayMedia call, and never re-fires once denied — so we deep-link the
 * user straight to the toggle.
 */
export function openPrivacySettings(kind: 'microphone' | 'screen'): void {
  if (process.platform !== 'darwin') return
  const anchor =
    kind === 'screen' ? 'Privacy_ScreenCapture' : 'Privacy_Microphone'
  shell.openExternal(
    `x-apple.systempreferences:com.apple.preference.security?${anchor}`
  )
}
