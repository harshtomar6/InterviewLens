import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { DEFAULT_SETTINGS, DEPRECATED_MODEL_IDS } from '@shared/types'

interface PersistedSettings {
  sttModel: string
  analysisModel: string
  language: string
  reduceBleed: boolean
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export async function readSettings(): Promise<PersistedSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>
    const heal = (id: string | undefined, fallback: string): string =>
      !id || DEPRECATED_MODEL_IDS.has(id) ? fallback : id
    return {
      sttModel: heal(parsed.sttModel, DEFAULT_SETTINGS.sttModel),
      analysisModel: heal(parsed.analysisModel, DEFAULT_SETTINGS.analysisModel),
      language: typeof parsed.language === 'string' ? parsed.language : DEFAULT_SETTINGS.language,
      reduceBleed:
        typeof parsed.reduceBleed === 'boolean'
          ? parsed.reduceBleed
          : DEFAULT_SETTINGS.reduceBleed
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function writeSettings(s: Partial<PersistedSettings>): Promise<PersistedSettings> {
  const current = await readSettings()
  const next: PersistedSettings = {
    sttModel: s.sttModel?.trim() || current.sttModel,
    analysisModel: s.analysisModel?.trim() || current.analysisModel,
    // language may be intentionally cleared to "" (auto-detect), so don't use ||.
    language: typeof s.language === 'string' ? s.language.trim() : current.language,
    reduceBleed: typeof s.reduceBleed === 'boolean' ? s.reduceBleed : current.reduceBleed
  }
  await fs.writeFile(settingsPath(), JSON.stringify(next, null, 2))
  return next
}
