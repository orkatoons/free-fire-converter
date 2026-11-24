import { app } from 'electron'
import { promises as fsp, readFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { BUILT_IN_PRESETS, DEFAULT_APP_SETTINGS, normalizeSettings } from '../shared/defaults'
import type { AppSettings, ConvertSettings, Preset } from '../shared/types'

const file = (): string => path.join(app.getPath('userData'), 'settings.json')

let current: AppSettings | null = null
let writeChain: Promise<void> = Promise.resolve()

export function loadSettings(): AppSettings {
  if (current) return current
  try {
    current = normalizeSettings(JSON.parse(readFileSync(file(), 'utf8')))
  } catch {
    current = normalizeSettings(DEFAULT_APP_SETTINGS)
  }
  return current
}

export function saveSettings(next: AppSettings): Promise<void> {
  current = normalizeSettings(next)
  const data = JSON.stringify(current, null, 2)
  // Serialize writes; write to temp then rename for atomicity.
  writeChain = writeChain.then(async () => {
    const f = file()
    await fsp.mkdir(path.dirname(f), { recursive: true })
    const tmp = `${f}.${process.pid}.tmp`
    await fsp.writeFile(tmp, data, 'utf8')
    await fsp.rename(tmp, f)
  }).catch((e) => console.error('Failed to save settings', e))
  return writeChain
}

export function listPresets(): Preset[] {
  return [...BUILT_IN_PRESETS, ...loadSettings().userPresets]
}

export async function savePreset(name: string, settings: ConvertSettings): Promise<Preset[]> {
  const s = loadSettings()
  const trimmed = name.trim() || 'My preset'
  const existing = s.userPresets.find((p) => p.name.toLowerCase() === trimmed.toLowerCase())
  const preset: Preset = { id: existing?.id ?? `user:${randomUUID()}`, name: trimmed, builtIn: false, settings: { ...settings } }
  const userPresets = existing
    ? s.userPresets.map((p) => (p.id === existing.id ? preset : p))
    : [...s.userPresets, preset]
  await saveSettings({ ...s, userPresets, activePresetId: preset.id })
  return listPresets()
}

export async function deletePreset(id: string): Promise<Preset[]> {
  const s = loadSettings()
  await saveSettings({
    ...s,
    userPresets: s.userPresets.filter((p) => p.id !== id),
    activePresetId: s.activePresetId === id ? null : s.activePresetId
  })
  return listPresets()
}
