import { useState, type ReactNode } from 'react'
import type { AppSettings, ConvertSettings, OutputSettings, Preset } from '../../shared/types'
import type { SettingsModel } from '../state/hooks'
import { IconFolder, IconRemove, IconRetry } from './icons'
import { Checkbox, Field, NumberInput, Segmented, Select } from './primitives'

export interface SettingsPanelProps {
  settings: AppSettings
  presets: Preset[]
  model: SettingsModel
  disabled: boolean
  onConvert: (patch: Partial<ConvertSettings>) => void
  onOutput: (patch: Partial<OutputSettings>) => void
  onApp: (patch: Partial<Pick<AppSettings, 'concurrency' | 'notifyOnFinish' | 'openFolderOnFinish'>>) => void
  onApplyPreset: (id: string) => void
  onSavePreset: (name: string) => void
  onDeletePreset: (id: string) => void
  onPickOutputFolder: () => void
  onUseSourceFolder: () => void
  onPickFfmpegDir: () => void
  onClearFfmpegDir: () => void
  onRefreshCaps: () => void
}

const CUSTOM = '__custom__'

export function SettingsPanel(p: SettingsPanelProps): ReactNode {
  const c = p.settings.convert
  const o = p.settings.output
  const m = p.model
  const [presetName, setPresetName] = useState<string | null>(null)
  const activePreset = p.presets.find((x) => x.id === p.settings.activePresetId)

  return (
    <aside className="settings" aria-label="Conversion settings">
      <section className="settings__section">
        <Field label="Preset" htmlFor="preset">
          <Select
            id="preset"
            value={activePreset?.id ?? CUSTOM}
            onChange={(v) => v !== CUSTOM && p.onApplyPreset(v)}
            options={[
              ...(activePreset ? [] : [{ value: CUSTOM, label: 'Custom (changed below)' }]),
              ...p.presets.map((x) => ({ value: x.id, label: x.builtIn ? x.name : `${x.name} (yours)` }))
            ]}
          />
        </Field>
        <div className="settings__row">
          {presetName === null ? (
            <>
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => setPresetName(activePreset && !activePreset.builtIn ? activePreset.name : '')}>
                Save these settings as a preset…
              </button>
              {activePreset && !activePreset.builtIn ? (
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => p.onDeletePreset(activePreset.id)}>
                  <IconRemove /> Delete preset
                </button>
              ) : null}
            </>
          ) : (
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault()
                if (presetName.trim()) p.onSavePreset(presetName)
                setPresetName(null)
              }}
            >
              <input
                className="input"
                autoFocus
                aria-label="Preset name"
                placeholder="Preset name"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setPresetName(null)}
              />
              <button type="submit" className="btn btn--sm btn--primary">
                Save
              </button>
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => setPresetName(null)}>
                Cancel
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="settings__section">
        <h2 className="settings__heading">Format</h2>
        <Field label="Save as" htmlFor="container">
          <Select
            id="container"
            value={c.container}
            onChange={(v) => p.onConvert({ container: v })}
            options={[
              { value: 'mp4', label: 'MP4 — plays everywhere' },
              { value: 'mkv', label: 'MKV — holds any codec' },
              { value: 'mov', label: 'MOV — Apple and video editors' },
              { value: 'webm', label: 'WebM — for the web' }
            ]}
          />
        </Field>
        <Field label="Video" hint={c.videoMode === 'copy' ? m.copyHint : 'Re-encoding lets you change codec, size and quality.'}>
          <Segmented
            ariaLabel="Video"
            value={c.videoMode}
            onChange={(v) => p.onConvert({ videoMode: v })}
            options={[
              { value: 'encode', label: 'Re-encode' },
              { value: 'copy', label: 'Copy as-is' }
            ]}
          />
        </Field>
      </section>

      <section className="settings__section">
        <h2 className="settings__heading">{c.videoMode === 'copy' ? 'Video, when copying isn’t possible' : 'Video'}</h2>
        <Field label="Codec" htmlFor="codec">
          <Select id="codec" value={c.videoCodec} onChange={(v) => p.onConvert({ videoCodec: v })} options={m.codecOptions} />
        </Field>
        <Field
          label="Quality"
          htmlFor="qmode"
          hint={
            c.qualityMode === 'cq'
              ? m.quality.hint
              : c.qualityMode === 'source-bitrate'
                ? 'Each file gets its source bitrate, adjusted for codec and size.'
                : 'Same bitrate for every file.'
          }
        >
          <Select
            id="qmode"
            value={c.qualityMode}
            onChange={(v) => p.onConvert({ qualityMode: v })}
            options={[
              { value: 'cq', label: 'Constant quality (recommended)' },
              { value: 'source-bitrate', label: 'Match source bitrate' },
              { value: 'bitrate', label: 'Fixed bitrate' }
            ]}
          />
        </Field>
        {c.qualityMode === 'cq' ? (
          <div className="slider">
            <span className="slider__end">Best</span>
            <input
              type="range"
              aria-label={`${m.quality.label} value`}
              min={m.quality.min}
              max={m.quality.max}
              value={c.quality}
              onChange={(e) => p.onConvert({ quality: Number(e.target.value) })}
            />
            <span className="slider__end">Smallest</span>
            <NumberInput ariaLabel={`${m.quality.label} value`} value={c.quality} min={m.quality.min} max={m.quality.max} onChange={(v) => p.onConvert({ quality: v })} suffix={m.quality.label} />
          </div>
        ) : null}
        {c.qualityMode === 'bitrate' ? (
          <Field label="Video bitrate" htmlFor="vbitrate">
            <NumberInput id="vbitrate" value={c.bitrateMbps} min={0.5} max={400} step={0.5} onChange={(v) => p.onConvert({ bitrateMbps: v })} suffix="Mbps" />
          </Field>
        ) : null}
        <Field label="Resolution" htmlFor="res">
          <Select
            id="res"
            value={c.resolution}
            onChange={(v) => p.onConvert({ resolution: v })}
            options={[
              { value: 'source', label: 'Match source' },
              { value: '2160', label: '2160p (4K)' },
              { value: '1440', label: '1440p' },
              { value: '1080', label: '1080p' },
              { value: '720', label: '720p' },
              { value: 'custom', label: 'Custom size…' }
            ]}
          />
        </Field>
        {c.resolution === 'custom' ? (
          <div className="settings__row">
            <NumberInput ariaLabel="Width" value={c.customWidth} min={0} max={8192} step={2} onChange={(v) => p.onConvert({ customWidth: v })} suffix="W" />
            <span className="settings__times" aria-hidden="true">×</span>
            <NumberInput ariaLabel="Height" value={c.customHeight} min={0} max={8192} step={2} onChange={(v) => p.onConvert({ customHeight: v })} suffix="H" />
            <span className="field__hint">0 keeps the aspect ratio</span>
          </div>
        ) : null}
        {c.resolution !== 'source' ? (
          <Checkbox checked={c.allowUpscale} onChange={(v) => p.onConvert({ allowUpscale: v })} label="Also enlarge smaller videos" />
        ) : null}
        <Field
          label="Frame rate"
          htmlFor="fps"
          hint={
            c.fpsMode === 'source'
              ? 'Keeps the original timing, including variable frame rate from screen recorders.'
              : c.fpsMode === 'cfr-source'
                ? 'Constant frame rate at the source’s average. Editors like Premiere and Resolve prefer this.'
                : undefined
          }
        >
          <Select
            id="fps"
            value={c.fpsMode}
            onChange={(v) => p.onConvert({ fpsMode: v })}
            options={[
              { value: 'source', label: 'Match source' },
              { value: 'cfr-source', label: 'Constant, at source rate (for editing)' },
              { value: 'fixed', label: 'Fixed rate…' }
            ]}
          />
        </Field>
        {c.fpsMode === 'fixed' ? (
          <div className="settings__row">
            <Select
              ariaLabel="Fixed frame rate"
              value={String(c.fixedFps)}
              onChange={(v) => p.onConvert({ fixedFps: Number(v) })}
              options={['24', '25', '30', '50', '60', '120'].map((v) => ({ value: v, label: `${v} fps` }))}
            />
          </div>
        ) : null}
        <Field label="HDR and 10-bit sources" htmlFor="hdr">
          <Select
            id="hdr"
            value={c.highBitDepth}
            onChange={(v) => p.onConvert({ highBitDepth: v })}
            options={[
              { value: 'preserve', label: 'Keep HDR (uses HEVC 10-bit)' },
              { value: 'tonemap', label: 'Convert to SDR / 8-bit' }
            ]}
          />
        </Field>
      </section>

      <section className="settings__section">
        <h2 className="settings__heading">Audio</h2>
        <div className="settings__row settings__row--pair">
          <Select
            ariaLabel="Audio format"
            value={c.audio}
            onChange={(v) => p.onConvert({ audio: v })}
            options={[
              { value: 'aac', label: 'AAC' },
              { value: 'opus', label: 'Opus' },
              { value: 'copy', label: 'Copy original' },
              { value: 'none', label: 'No audio' }
            ]}
          />
          {c.audio === 'aac' || c.audio === 'opus' ? (
            <Select
              ariaLabel="Audio bitrate"
              value={String(c.audioBitrateKbps)}
              onChange={(v) => p.onConvert({ audioBitrateKbps: Number(v) })}
              options={['96', '128', '160', '192', '256', '320'].map((v) => ({ value: v, label: `${v} kbps` }))}
            />
          ) : null}
        </div>
      </section>

      <section className="settings__section">
        <h2 className="settings__heading">Output</h2>
        <Field label="Save to">
          <div className="settings__path" title={m.outputLabel}>
            {m.outputLabel}
          </div>
          <div className="settings__row">
            <button type="button" className="btn btn--sm" onClick={p.onPickOutputFolder}>
              <IconFolder /> Choose folder…
            </button>
            {o.dir ? (
              <button type="button" className="btn btn--sm btn--ghost" onClick={p.onUseSourceFolder}>
                Next to each original
              </button>
            ) : null}
          </div>
        </Field>
        <Field label="File name" htmlFor="tpl" hint={<>Use <code>{'{name}'}</code> <code>{'{res}'}</code> <code>{'{codec}'}</code> <code>{'{date}'}</code></>}>
          <input id="tpl" className="input" value={o.filenameTemplate} onChange={(e) => p.onOutput({ filenameTemplate: e.target.value })} />
        </Field>
        <Field label="If a file with that name exists" htmlFor="conflict">
          <Select
            id="conflict"
            value={o.conflict}
            onChange={(v) => p.onOutput({ conflict: v })}
            options={[
              { value: 'rename', label: 'Add a number, like “name (1)”' },
              { value: 'overwrite', label: 'Replace it' },
              { value: 'skip', label: 'Skip that file' }
            ]}
          />
        </Field>
      </section>

      <details className="settings__section settings__advanced">
        <summary className="settings__heading settings__summary">Advanced</summary>
        <Field label="Encoder" htmlFor="encoder">
          <Select
            id="encoder"
            value={c.encoder}
            onChange={(v) => p.onConvert({ encoder: v })}
            options={[
              { value: 'auto', label: m.autoEncoderLabel },
              ...m.encoderOptions.map((e) => ({ value: e.id, label: e.available ? e.label : `${e.label} (${e.reason})`, disabled: !e.available }))
            ]}
          />
        </Field>
        <Field label="Speed" htmlFor="speed" hint="Slower makes slightly smaller files at the same quality.">
          <Select
            id="speed"
            value={c.speed}
            onChange={(v) => p.onConvert({ speed: v })}
            options={[
              { value: 'fastest', label: 'Fastest' },
              { value: 'fast', label: 'Fast' },
              { value: 'balanced', label: 'Balanced' },
              { value: 'quality', label: 'Quality' },
              { value: 'best', label: 'Best (slowest)' }
            ]}
          />
        </Field>
        <Checkbox checked={c.hwDecode} onChange={(v) => p.onConvert({ hwDecode: v })} label="Decode on the GPU (falls back automatically)" />
        <Field label="Files at once" htmlFor="conc" hint="1 is usually fastest for 4K on one GPU.">
          <NumberInput id="conc" value={p.settings.concurrency} min={1} max={4} onChange={(v) => p.onApp({ concurrency: Math.min(4, Math.max(1, Math.round(v))) })} />
        </Field>
        <Checkbox checked={p.settings.notifyOnFinish} onChange={(v) => p.onApp({ notifyOnFinish: v })} label="Notify me when everything is done" />
        <Checkbox checked={p.settings.openFolderOnFinish} onChange={(v) => p.onApp({ openFolderOnFinish: v })} label="Open the output folder when done" />
        <Field label="ffmpeg">
          <div className="settings__path" title={m.ffmpegInfo}>
            {m.ffmpegInfo}
          </div>
          <div className="settings__path">GPU encoders that passed: {m.verifiedHardware.length ? m.verifiedHardware.join(', ') : 'none'}</div>
          <div className="settings__row">
            <button type="button" className="btn btn--sm" onClick={p.onPickFfmpegDir}>
              <IconFolder /> Use a different ffmpeg…
            </button>
            {p.settings.ffmpegDir ? (
              <button type="button" className="btn btn--sm btn--ghost" onClick={p.onClearFfmpegDir}>
                Use the one on PATH
              </button>
            ) : null}
            <button type="button" className="btn btn--sm btn--ghost" onClick={p.onRefreshCaps}>
              <IconRetry /> Test again
            </button>
          </div>
        </Field>
      </details>
    </aside>
  )
}
