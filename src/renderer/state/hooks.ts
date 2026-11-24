// Derived data + side-effect hooks. Components receive these values as props via App.tsx.

import { useEffect, useMemo, useRef } from 'react'
import { AUTO_ORDER, CODEC_LABEL, CONTAINER_COPY_VIDEO, CONTAINER_ENCODE_CODECS, ENCODERS, encoderUsable, qualityRange, usableEncodersFor } from '../../shared/encoders'
import { formatDuration, mediaSpecs } from '../../shared/format'
import { resolvePlan } from '../../shared/plan'
import type { Job, VideoCodec } from '../../shared/types'
import { useAppStore } from './store'

export interface JobRowModel {
  job: Job
  specs: string[]
  /** Resolved output description: from the run if it started, otherwise a live preview of current settings */
  outputSummary: string | null
  warnings: string[]
  notes: string[]
  errors: string[]
  selected: boolean
  canCancel: boolean
  canRetry: boolean
  canRemove: boolean
  canStartOne: boolean
  hasOutput: boolean
  hasLog: boolean
  statusLabel: string
  progressLabel: string | null
}

const STATUS_LABEL: Record<Job['status'], string> = {
  probing: 'Reading…',
  'probe-failed': "Can't read",
  ready: 'Ready',
  queued: 'Queued',
  running: 'Converting',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
  skipped: 'Skipped'
}

export function useJobRows(): JobRowModel[] {
  const jobs = useAppStore((s) => s.jobs)
  const convert = useAppStore((s) => s.settings.convert)
  const caps = useAppStore((s) => s.caps)
  const selected = useAppStore((s) => s.selected)

  return useMemo(() => {
    const sel = new Set(selected)
    return jobs.map((job): JobRowModel => {
      const started = job.planSummary != null && job.status !== 'ready'
      const preview = job.media && !started ? resolvePlan(job.media, convert, caps) : null
      const st = job.status
      let progressLabel: string | null = null
      if (st === 'running') {
        const pct = job.progress != null ? `${Math.floor(job.progress * 100)}%` : 'working…'
        const speed = job.speed ? ` · ${job.speed.toFixed(2)}×` : ''
        const eta = job.etaSec != null ? ` · ${formatDuration(job.etaSec)} left` : ''
        progressLabel = `${pct}${speed}${eta}`
      } else if (st === 'done' && job.elapsedSec != null) {
        progressLabel = `took ${formatDuration(job.elapsedSec)}`
      }
      return {
        job,
        specs: job.media ? mediaSpecs(job.media) : [],
        outputSummary: started ? job.planSummary : (preview?.summary ?? null),
        warnings: started ? job.planWarnings : (preview?.warnings ?? []),
        notes: preview?.notes ?? [],
        errors: preview?.errors ?? [],
        selected: sel.has(job.id),
        canCancel: st === 'running' || st === 'queued',
        canRetry: st === 'failed' || st === 'cancelled' || st === 'skipped' || st === 'probe-failed' || st === 'done',
        canRemove: st !== 'running',
        canStartOne: st === 'ready' && !!preview?.ok,
        hasOutput: st === 'done' && !!job.outputPath,
        hasLog: job.attempt > 0 || !!job.error,
        statusLabel: STATUS_LABEL[st],
        progressLabel
      }
    })
  }, [jobs, convert, caps, selected])
}

export interface Totals {
  total: number
  ready: number
  running: number
  queued: number
  done: number
  failed: number
  finished: number
  canStart: boolean
  /** 0..1 or null if nothing is running */
  overallProgress: number | null
  overallEtaSec: number | null
  runCount: number
  runDone: number
}

export function useTotals(): Totals {
  const jobs = useAppStore((s) => s.jobs)
  const queue = useAppStore((s) => s.queue)
  const caps = useAppStore((s) => s.caps)
  const convert = useAppStore((s) => s.settings.convert)
  const concurrency = useAppStore((s) => s.settings.concurrency)

  return useMemo(() => {
    const count = (st: Job['status']): number => jobs.filter((j) => j.status === st).length
    const ready = jobs.filter((j) => j.status === 'ready' && j.media && resolvePlan(j.media, convert, caps).ok).length
    const run = jobs.filter((j) => queue.runIds.includes(j.id))
    let weightSum = 0
    let doneSum = 0
    let runDone = 0
    let queuedSec = 0
    let runningEta = 0
    let speedSum = 0
    let speedN = 0
    for (const j of run) {
      const w = j.media?.duration ?? 60
      weightSum += w
      if (j.status === 'running') {
        doneSum += w * (j.progress ?? 0)
        if (j.etaSec != null) runningEta = Math.max(runningEta, j.etaSec)
        if (j.speed) {
          speedSum += j.speed
          speedN++
        }
      } else if (j.status === 'queued') {
        queuedSec += w
      } else {
        doneSum += w
        runDone++
      }
    }
    const avgSpeed = speedN ? speedSum / speedN : null
    const overallEtaSec = queue.running && avgSpeed ? runningEta + queuedSec / avgSpeed / Math.max(1, concurrency) : null
    return {
      total: jobs.length,
      ready,
      running: count('running'),
      queued: count('queued'),
      done: count('done'),
      failed: count('failed'),
      finished: jobs.filter((j) => j.status === 'done' || j.status === 'cancelled' || j.status === 'skipped').length,
      canStart: !!caps?.ffmpegFound && ready > 0,
      overallProgress: queue.running && weightSum > 0 ? doneSum / weightSum : null,
      overallEtaSec,
      runCount: run.length,
      runDone
    }
  }, [jobs, queue, caps, convert, concurrency])
}

export interface EncoderOption {
  id: string
  label: string
  available: boolean
  reason?: string
}

export interface SettingsModel {
  codecOptions: Array<{ value: VideoCodec; label: string }>
  encoderOptions: EncoderOption[]
  autoEncoderLabel: string
  quality: { min: number; max: number; label: string; hint: string }
  copyHint: string
  activePresetName: string | null
  outputLabel: string
  ffmpegInfo: string
  verifiedHardware: string[]
}

export function useSettingsModel(): SettingsModel {
  const settings = useAppStore((s) => s.settings)
  const caps = useAppStore((s) => s.caps)
  const presets = useAppStore((s) => s.presets)

  return useMemo(() => {
    const c = settings.convert
    const codecOptions = CONTAINER_ENCODE_CODECS[c.container].map((v) => ({ value: v, label: CODEC_LABEL[v] }))
    const encoderOptions: EncoderOption[] = AUTO_ORDER[c.videoCodec].map((id) => {
      const st = caps?.encoders[id]
      const available = encoderUsable(caps, id)
      return {
        id,
        label: `${id} — ${ENCODERS[id].label}`,
        available,
        reason: available ? undefined : !st?.listed ? 'not in this ffmpeg build' : 'failed hardware test'
      }
    })
    const auto = usableEncodersFor(c.videoCodec, caps)[0]
    const kind = (c.encoder !== 'auto' && ENCODERS[c.encoder]) ? ENCODERS[c.encoder].kind : auto?.kind ?? 'x264'
    const range = qualityRange(kind)
    const qLabel = kind === 'nvenc' ? 'CQ' : kind === 'amf' ? 'QP' : 'CRF'
    const copyList = CONTAINER_COPY_VIDEO[c.container]
    const copyHint = copyList
      ? `Copies the video stream untouched when the source is ${copyList.filter((x) => x !== 'mpeg4').map((x) => x.toUpperCase()).join('/')}. Other files are re-encoded with the settings below.`
      : 'MKV accepts any codec, so video is always copied untouched.'
    const active = presets.find((p) => p.id === settings.activePresetId)
    const verifiedHardware = caps
      ? Object.entries(caps.encoders).filter(([id, s]) => s.verified && ENCODERS[id]?.hardware).map(([id]) => id)
      : []
    return {
      codecOptions,
      encoderOptions,
      autoEncoderLabel: auto ? `Auto (${auto.id})` : 'Auto (none available)',
      quality: {
        min: range.min,
        max: range.max,
        label: qLabel,
        hint: `${qLabel} ${range.min}–${range.max}, lower = better quality & bigger file`
      },
      copyHint,
      activePresetName: active?.name ?? null,
      outputLabel: settings.output.dir ?? 'Same folder as each source file',
      ffmpegInfo: caps?.ffmpegFound
        ? `ffmpeg ${caps.version} (${caps.source === 'managed' ? 'downloaded by this app' : caps.source === 'custom' ? 'your chosen folder' : 'installed on this PC'}) — ${caps.ffmpegPath}`
        : caps?.error ?? 'Detecting…',
      verifiedHardware
    }
  }, [settings, caps, presets])
}

// ---------- side effects ----------

export function useInit(): void {
  const init = useAppStore((s) => s.init)
  const did = useRef(false)
  useEffect(() => {
    if (did.current) return
    did.current = true
    void init()
  }, [init])
}

export function useNoticeAutoDismiss(): void {
  const notices = useAppStore((s) => s.notices)
  const dismiss = useAppStore((s) => s.dismissNotice)
  useEffect(() => {
    const timers = notices
      .filter((n) => n.level !== 'error')
      .map((n) => setTimeout(() => dismiss(n.id), n.level === 'warning' ? 8000 : 4000))
    return () => timers.forEach(clearTimeout)
  }, [notices, dismiss])
}

/** Whole window is a drop target. */
export function useWindowDrop(): void {
  const setDragOver = useAppStore((s) => s.setDragOver)
  const addDroppedFiles = useAppStore((s) => s.addDroppedFiles)
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent): boolean => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
    const onEnter = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth++
      setDragOver(true)
    }
    const onOver = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onLeave = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragOver(false)
    }
    const onDrop = (e: DragEvent): void => {
      e.preventDefault()
      depth = 0
      setDragOver(false)
      const files = e.dataTransfer ? Array.from(e.dataTransfer.files) : []
      if (files.length) void addDroppedFiles(files)
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [setDragOver, addDroppedFiles])
}

/** Ctrl+O add files, Delete remove selected, Ctrl+Enter start, Ctrl+A select all, Esc close dialog. */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const st = useAppStore.getState()
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      if (e.key === 'Escape' && st.dialog) {
        st.closeDialog()
        return
      }
      if (st.dialog) return
      if (e.ctrlKey && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        void st.pickFiles()
      } else if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault()
        if (!st.queue.running) void st.start()
      } else if (typing) {
        return
      } else if (e.key === 'Delete' && st.selected.length) {
        e.preventDefault()
        void st.removeSelected()
      } else if (e.ctrlKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        st.selectAll()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
