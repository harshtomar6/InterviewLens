import { safeStorage, app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'

// Primary store: OS keychain via keytar. Fallback: Electron safeStorage-encrypted
// file (used if keytar's native module is unavailable). The key is NEVER logged
// and NEVER written in plaintext.

const SERVICE = 'InterviewLens'
const ACCOUNT = 'openrouter-api-key'

interface KeytarLike {
  getPassword(service: string, account: string): Promise<string | null>
  setPassword(service: string, account: string, password: string): Promise<void>
  deletePassword(service: string, account: string): Promise<boolean>
}

let keytar: KeytarLike | null = null
try {
  // Lazy require so a broken native build degrades gracefully to the fallback.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  keytar = require('keytar') as KeytarLike
} catch {
  keytar = null
}

function fallbackPath(): string {
  return join(app.getPath('userData'), 'openrouter.key.enc')
}

export async function getApiKey(): Promise<string | null> {
  if (keytar) {
    try {
      return await keytar.getPassword(SERVICE, ACCOUNT)
    } catch {
      // fall through to file fallback
    }
  }
  try {
    const enc = await fs.readFile(fallbackPath())
    if (!safeStorage.isEncryptionAvailable()) return null
    return safeStorage.decryptString(enc)
  } catch {
    return null
  }
}

export async function setApiKey(key: string): Promise<void> {
  const trimmed = key.trim()
  if (!trimmed) throw new Error('API key is empty')
  if (keytar) {
    try {
      await keytar.setPassword(SERVICE, ACCOUNT, trimmed)
      return
    } catch {
      // fall through
    }
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'Secure storage is unavailable on this system; cannot persist the API key safely.'
    )
  }
  const enc = safeStorage.encryptString(trimmed)
  await fs.writeFile(fallbackPath(), enc, { mode: 0o600 })
}

export async function deleteApiKey(): Promise<void> {
  if (keytar) {
    try {
      await keytar.deletePassword(SERVICE, ACCOUNT)
    } catch {
      /* ignore */
    }
  }
  await fs.rm(fallbackPath(), { force: true })
}

export async function hasApiKey(): Promise<boolean> {
  return (await getApiKey()) !== null
}
