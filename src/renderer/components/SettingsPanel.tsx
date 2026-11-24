import { useState, type ReactNode } from 'react'
import type { AppSettings, ConvertSettings, OutputSettings, Preset } from '../../shared/types'
import type { SettingsModel } from '../state/hooks'
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
  const encoding = c.videoMode === 'encode' || c.container !== 'mkv'

  return (
    <aside className="settings" aria-label="Conversion settings">
      {/* Presets */}
      <section className="settings__section">
        <Field label="Preset" htmlFor="preset">
          <Select
            id="preset"
            value={activePreset?.id ?? CUSTOM}
            onChange={(v) => v !== CUSTOM && p.onApplyPreset(v)}
            options={[
              ...(activePreset ? [] : [{ value: CUSTOM, label: 'Custom (modified)' }]),
              ...p.presets.map((x) => ({ value: x.id, label: x.builtIn ? x.name : `★ ${x.name}` }))
            ]}
          />
        </Field>
        <div className="settings__row">
          {presetName === null ? (
            <button type="button" className="btn btn--small" onClick={() => setPresetName(activePreset && !activePreset.builtIn ? activePreset.name : '')}>
              Save as preset…
            </button>
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
                placeholder="Preset name"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setPresetName(null)}
              />
              <button type="submit" className="btn btn--small btn--primary">
                Save
              </button>
              <button type="button" className="btn btn--small btn--ghost" onClick={() => setPresetName(null)}>
                Cancel
              </button>
            </form>
          )}
          {activePreset && !activePreset.builtIn && presetName === null ? (
            <button type="button" className="btn btn--small btn--ghost" onClick={() => p.onDeletePreset(activePreset.id)}>
              Delete preset
            </button>
          ) : null}
        </div>
      </section>

      {/* Format */}
      <section className="settings__section">
        <h2 className="settings__heading">Format</h2>
        <Field label="Container" htmlFor="container">
          <Select
            id="container"
            value={c.container}
            onChange={(v) => p.onConvert({ container: v })}
            options={[
              { value: 'mp4', label: 'MP4 — plays everywhere' },
              { value: 'mkv', label: 'MKV — holds anything' },
              { value: 'mov', label: 'MOV — Apple / editors' },
              { value: 'webm', label: 'WebM — web' }
            ]}
          />
        </Field>
        <Field label="Video" hint={c.videoMode === 'copy' ? m.copyHint : undefined}>
          <Segmented
            ariaLabel="Video mode"
            value={c.videoMode}
            onChange={(v) => p.onConvert({ videoMode: v })}
            options={[
              { value: 'encode', label: 'Re-encode' },
              { value: 'copy', label: 'Copy (no re-encode)' }
            ]}
          />
        </Field>
      </section>

      {/* Video */}
      <section className="settings__section" aria-disabled={!encoding}>
        <h2 className="settings__heading">Video{c.videoMode === 'copy' ? ' (used when copy isn’t possible)' : ''}</h2>
        <Field label="Codec" htmlFor="codec">
          <Select id="codec" value={c.videoCodec} onChange={(v) => p.onConvert({ videoCodec: v })} options={m.codecOptions} />
        </Field>
        <Field label="Quality" htmlFor="qmode" hint={c.qualityMode === 'cq' ? m.quality.hint : c.qualityMode === 'source-bitrate' ? 'Per file: source bitrate, adjusted for codec efficiency and resolution.' : undefined}>
          <Select
            id="qmode"
            value={c.qualityMode}
            onChange={(v) => p.onConvert({ qualityMode: v })}
            options={[
              { value: 'cq', label: 'Constant quality (recommended)' },
              { value: 'source-bitrate', label: 'Match source bitrate' },
              { value: 'bitrate', label: 'Target bitrate' }
            ]}
          />
        </Field>
        {c.qualityMode === 'cq' ? (
          <div className="settings__row settings__row--slider">
            <input
              type="range"
              aria-label={`${m.quality.label} value`}
              min={m.quality.min}
              max={m.quality.max}
              value={c.quality}
              onChange={(e) => p.onConvert({ quality: Number(e.target.value) })}
            />
            <NumberInput value={c.quality} min={m.quality.min} max={m.quality.max} onChange={(v) => p.onConvert({ quality: v })} suffix={m.quality.label} />
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
              { value: 'custom', label: 'Custom…' }
            ]}
          />
        </Field>
        {c.resolution === 'custom' ? (
          <div className="settings__row">
            <NumberInput value={c.customWidth} min={0} max={8192} step={2} onChange={(v) => p.onConvert({ customWidth: v })} suffix="W" />
            <span>×</span>
            <NumberInput value={c.customHeight} min={0} max={8192} step={2} onChange={(v) => p.onConvert({ customHeight: v })} suffix="H" />
            <span className="field__hint">0 = keep aspect</span>
          </div>
        ) : null}
        {c.resolution !== 'source' ? (
          <Checkbox checked={c.allowUpscale} onChange={(v) => p.onConvert({ allowUpscale: v })} label="Allow upscaling smaller sources" />
        ) : null}
        <Field
          label="Frame rate"
          htmlFor="fps"
          hint={
            c.fpsMode === 'source'
              ? 'Keeps original timing, including variable frame rate (screen recordings).'
              : c.fpsMode === 'cfr-source'
                ? 'Constant frame rate at the source’s average — editors like Premiere/Resolve prefer this.'
                : undefined
          }
        >
          <Select
            id="fps"
            value={c.fpsMode}
            onChange={(v) => p.onConvert({ fpsMode: v })}
            options={[
              { value: 'source', label: 'Match source (keep timing)' },
              { value: 'cfr-source', label: 'Constant, at source fps (for editing)' },
              { value: 'fixed', label: 'Fixed…' }
            ]}
          />
        </Field>
        {c.fpsMode === 'fixed' ? (
          <div className="settings__row">
            <Select
              value={String(c.fixedFps)}
              onChange={(v) => p.onConvert({ fixedFps: Number(v) })}
              options={['24', '25', '30', '50', '60', '120'].map((v) => ({ value: v, label: `${v} fps` }))}
            />
          </div>
        ) : null}
        <Field label="10-bit / HDR sources" htmlFor="hdr">
          <Select
            id="hdr"
            value={c.highBitDepth}
            onChange={(v) => p.onConvert({ highBitDepth: v })}
            options={[
              { value: 'preserve', label: 'Preserve (switches H.264 → HEVC 10-bit)' },
              { value: 'tonemap', label: 'Convert to SDR / 8-bit' }
            ]}
          />
        </Field>
      </section>

      {/* Audio */}
      <section className="settings__section">
        <h2 className="settings__heading">Audio</h2>
        <div className="settings__row">
          <Select
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
              value={String(c.audioBitrateKbps)}
              onChange={(v) => p.onConvert({ audioBitrateKbps: Number(v) })}
              options={['96', '128', '160', '192', '256', '320'].map((v) => ({ value: v, label: `${v} kbps` }))}
            />
          ) : null}
        </div>
      </section>

      {/* Output */}
      <section className="settings__section">
        <h2 className="settings__heading">Output</h2>
        <Field label="Save to">
          <div className="settings__path" title={m.outputLabel}>
            {m.outputLabel}
          </div>
          <div className="settings__row">
            <button type="button" className="btn btn--small" onClick={p.onPickOutputFolder}>
              Choose folder…
            </button>
            {o.dir ? (
              <button type="button" className="btn btn--small btn--ghost" onClick={p.onUseSourceFolder}>
                Use source folder
              </button>
            ) : null}
          </div>
        </Field>
        <Field label="File name" htmlFor="tpl" hint="Tokens: {name} {res} {codec} {date}">
          <input id="tpl" className="input" value={o.filenameTemplate} onChange={(e) => p.onOutput({ filenameTemplate: e.target.value })} />
        </Field>
        <Field label="If the file exists" htmlFor="conflict">
          <Select
            id="conflict"
            value={o.conflict}
            onChange={(v) => p.onOutput({ conflict: v })}
            options={[
              { value: 'rename', label: 'Add a number — “name (1)”' },
              { value: 'overwrite', label: 'Overwrite' },
              { value: 'skip', label: 'Skip' }
            ]}
          />
        </Field>
      </section>

      {/* Advanced */}
      <details className="settings__section settings__advanced">
        <summary className="settings__heading">Advanced</summary>
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
        <Field label="Speed" htmlFor="speed" hint="Slower = slightly smaller files at the same quality.">
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
        <Checkbox checked={c.hwDecode} onChange={(v) => p.onConvert({ hwDecode: v })} label="Hardware decoding (auto-retries without it on failure)" />
        <Field label="Files at once" htmlFor="conc" hint="1 is usually fastest for 4K on a single GPU.">
          <NumberInput id="conc" value={p.settings.concurrency} min={1} max={4} onChange={(v) => p.onApp({ concurrency: Math.min(4, Math.max(1, Math.round(v))) })} />
        </Field>
        <Checkbox checked={p.settings.notifyOnFinish} onChange={(v) => p.onApp({ notifyOnFinish: v })} label="Notify when the queue finishes" />
        <Checkbox checked={p.settings.openFolderOnFinish} onChange={(v) => p.onApp({ openFolderOnFinish: v })} label="Open output folder when finished" />
        <Field label="ffmpeg">
          <div className="settings__path" title={m.ffmpegInfo}>
            {m.ffmpegInfo}
          </div>
          <div className="settings__path">
            GPU encoders verified: {m.verifiedHardware.length ? m.verifiedHardware.join(', ') : 'none'}
          </div>
          <div className="settings__row">
            <button type="button" className="btn btn--small" onClick={p.onPickFfmpegDir}>
              Use a different ffmpeg…
            </button>
            {p.settings.ffmpegDir ? (
              <button type="button" className="btn btn--small btn--ghost" onClick={p.onClearFfmpegDir}>
                Use PATH
              </button>
            ) : null}
            <button type="button" className="btn btn--small btn--ghost" onClick={p.onRefreshCaps}>
              Re-check
            </button>
          </div>
        </Field>
      </details>
    </aside>
  )
}
