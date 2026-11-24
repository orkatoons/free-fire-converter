// Electron-free job queue: probing, planning, running ffmpeg, output files, retries.

import { EventEmitter } from 'node:events'
import { promises as fsp, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { VIDEO_EXTENSIONS, clampInt } from '../shared/defaults'
import type {
  AddResult,
  AppSettings,
  Capabilities,
  Job,
  QueueFinishedSummary,
  StateSnapshot
} from '../shared/types'
import { buildArgs, buildConversion, formatCommand } from './ffmpeg/args'
import type { FfmpegPaths } from './ffmpeg/locate'
import { probeFile } from './ffmpeg/probe'
import { runFfmpeg, type RunHandle } from './ffmpeg/runner'
import { reserveKey, resolveOutputTarget } from './outputs'

export interface QueueDeps {
  getCapabilities(): Promise<Capabilities>
}

interface InternalJob extends Job {
  settings: AppSettings | null
  handle: RunHandle | null
  cancelRequested: boolean
  log: string[]
  partPath: string | null
}

const LOG_LIMIT = 300
const PROBE_CONCURRENCY = 3
const FINISHED: Job['status'][] = ['done', 'cancelled', 'skipped']
const RESTARTABLE: Job['status'][] = ['ready', 'failed', 'cancelled', 'skipped', 'done']

export class JobQueue extends EventEmitter {
  private jobs = new Map<string, InternalJob>()
  private order: string[] = []
  private running = false
  private paused = false
  private concurrency = 1
  private runIds = new Set<string>()
  private emitTimer: NodeJS.Timeout | null = null
  private probeActive = 0
  private probeWaiters: Array<() => void> = []

  constructor(private deps: QueueDeps) {
    super()
  }

  // ---------- state ----------

  snapshot(): StateSnapshot {
    return {
      jobs: this.order.map((id) => publicJob(this.jobs.get(id)!)),
      queue: { running: this.running, paused: this.paused, runIds: [...this.runIds] }
    }
  }

  private emitState(immediate = false): void {
    if (immediate) {
      if (this.emitTimer) clearTimeout(this.emitTimer)
      this.emitTimer = null
      this.emit('state', this.snapshot())
      return
    }
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null
      this.emit('state', this.snapshot())
    }, 150)
  }

  getJob(id: string): Job | null {
    const j = this.jobs.get(id)
    return j ? publicJob(j) : null
  }

  getLog(id: string): string[] {
    return this.jobs.get(id)?.log.slice() ?? []
  }

  // ---------- adding ----------

  async addPaths(paths: string[]): Promise<AddResult> {
    const files: string[] = []
    const unsupported: string[] = []
    for (const p of paths) {
      let st
      try {
        st = statSync(p)
      } catch {
        unsupported.push(path.basename(p))
        continue
      }
      if (st.isDirectory()) files.push(...(await collectVideos(p, 6)))
      else if (isVideo(p)) files.push(p)
      else unsupported.push(path.basename(p))
    }

    const existing = new Set([...this.jobs.values()].map((j) => reserveKey(j.inputPath)))
    let duplicates = 0
    const added: InternalJob[] = []
    for (const f of files) {
      const key = reserveKey(f)
      if (existing.has(key)) {
        duplicates++
        continue
      }
      existing.add(key)
      const job = newJob(f)
      this.jobs.set(job.id, job)
      this.order.push(job.id)
      added.push(job)
    }
    this.emitState(true)
    for (const j of added) void this.probe(j)
    return { added: added.length, duplicates, unsupported }
  }

  private async probe(job: InternalJob): Promise<void> {
    await this.acquireProbe()
    try {
      const caps = await this.deps.getCapabilities()
      if (!caps.ffmpegFound || !caps.ffprobePath || !caps.ffmpegPath) throw new Error('ffmpeg not found')
      const paths: FfmpegPaths = { ffmpeg: caps.ffmpegPath, ffprobe: caps.ffprobePath }
      const media = await probeFile(paths, job.inputPath)
      if (!this.jobs.has(job.id)) return
      job.media = media
      job.status = media.video ? 'ready' : 'probe-failed'
      if (!media.video) job.error = 'No video stream found.'
    } catch (e) {
      if (!this.jobs.has(job.id)) return
      job.status = 'probe-failed'
      job.error = e instanceof Error ? e.message : String(e)
    } finally {
      this.releaseProbe()
      this.emitState()
    }
  }

  /** Re-probe failed probes (e.g. after ffmpeg path was fixed). */
  reprobeFailed(): void {
    for (const j of this.jobs.values()) {
      if (j.status === 'probe-failed') {
        j.status = 'probing'
        j.error = null
        void this.probe(j)
      }
    }
    this.emitState()
  }

  private acquireProbe(): Promise<void> {
    if (this.probeActive < PROBE_CONCURRENCY) {
      this.probeActive++
      return Promise.resolve()
    }
    return new Promise((r) => this.probeWaiters.push(() => (this.probeActive++, r())))
  }

  private releaseProbe(): void {
    this.probeActive--
    this.probeWaiters.shift()?.()
  }

  // ---------- queue control ----------

  start(settings: AppSettings, ids?: string[]): void {
    this.concurrency = clampInt(settings.concurrency, 1, 4)
    const targets = ids
      ? ids.map((id) => this.jobs.get(id)).filter((j): j is InternalJob => !!j && RESTARTABLE.includes(j.status) && !!j.media)
      : [...this.order.map((id) => this.jobs.get(id)!)].filter((j) => j.status === 'ready')
    for (const j of targets) {
      resetRun(j)
      j.settings = structuredClone(settings)
      j.status = 'queued'
      this.runIds.add(j.id)
    }
    if (targets.length) {
      this.running = true
      this.paused = false
    }
    this.emitState(true)
    this.pump()
  }

  retry(id: string, settings: AppSettings): void {
    const j = this.jobs.get(id)
    if (!j) return
    if (j.status === 'probe-failed') {
      j.status = 'probing'
      j.error = null
      void this.probe(j)
      return
    }
    this.start(settings, [id])
  }

  pause(): void {
    if (!this.running) return
    this.paused = true
    this.emitState(true)
    this.checkFinished()
  }

  resume(): void {
    this.paused = false
    this.emitState(true)
    this.pump()
  }

  cancel(id: string): void {
    const j = this.jobs.get(id)
    if (!j) return
    if (j.status === 'queued') {
      j.status = 'ready'
      this.runIds.delete(j.id)
      this.emitState(true)
      this.checkFinished()
    } else if (j.status === 'running') {
      j.cancelRequested = true
      j.handle?.cancel()
    }
  }

  cancelAll(): void {
    for (const j of this.jobs.values()) {
      if (j.status === 'queued') {
        j.status = 'ready'
        this.runIds.delete(j.id)
      } else if (j.status === 'running') {
        j.cancelRequested = true
        j.handle?.cancel()
      }
    }
    this.emitState(true)
    this.checkFinished()
  }

  remove(ids: string[]): void {
    for (const id of ids) {
      const j = this.jobs.get(id)
      if (!j || j.status === 'running') continue
      this.jobs.delete(id)
      this.runIds.delete(id)
    }
    this.order = this.order.filter((id) => this.jobs.has(id))
    this.emitState(true)
    this.checkFinished()
  }

  clearFinished(): void {
    this.remove([...this.jobs.values()].filter((j) => FINISHED.includes(j.status)).map((j) => j.id))
  }

  /** Resolves when the queue goes idle (used by tests). */
  waitIdle(): Promise<QueueFinishedSummary | null> {
    if (!this.running) return Promise.resolve(null)
    return new Promise((r) => this.once('finished', r))
  }

  async previewCommand(id: string, settings: AppSettings): Promise<string | null> {
    const j = this.jobs.get(id)
    if (!j?.media) return null
    if (j.command && (j.status === 'running' || j.status === 'done' || j.status === 'failed')) return j.command
    const caps = await this.deps.getCapabilities()
    const { plan } = buildConversion(j.media, settings.convert, caps, 'x')
    if (!plan.ok) return `# Can't convert: ${plan.errors.join(' ')}`
    const target = resolveOutputTarget(
      j.inputPath,
      plan.container,
      settings.output,
      { res: plan.resLabel, codec: plan.codecLabel },
      this.reservedPaths(j.id)
    )
    const out = target.finalPath ?? target.skippedBecauseExists ?? 'output'
    return formatCommand(caps.ffmpegPath ?? 'ffmpeg', ['-nostats', '-progress', 'pipe:1', ...buildArgs(j.media, plan, out)])
  }

  // ---------- running ----------

  private activeCount(): number {
    let n = 0
    for (const j of this.jobs.values()) if (j.status === 'running') n++
    return n
  }

  private pump(): void {
    if (!this.running || this.paused) return
    let active = this.activeCount()
    for (const id of this.order) {
      if (active >= this.concurrency) break
      const j = this.jobs.get(id)!
      if (j.status !== 'queued') continue
      active++
      j.status = 'running'
      j.attempt = 0
      void this.launch(j, false)
    }
    this.emitState(true)
    this.checkFinished()
  }

  private reservedPaths(exceptId: string): Set<string> {
    const s = new Set<string>()
    for (const j of this.jobs.values()) {
      if (j.id !== exceptId && j.status === 'running' && j.outputPath) s.add(reserveKey(j.outputPath))
    }
    return s
  }

  private async launch(j: InternalJob, forceNoHw: boolean): Promise<void> {
    j.attempt++
    j.startedAt = Date.now()
    j.progress = j.media?.duration ? 0 : null
    j.error = null
    try {
      const caps = await this.deps.getCapabilities()
      if (!caps.ffmpegPath) throw new Error('ffmpeg not found')
      if (j.cancelRequested) return this.finishJob(j, 'cancelled')
      const settings = j.settings!
      const media = j.media!

      const { plan } = buildConversion(media, settings.convert, caps, 'x', { forceNoHwDecode: forceNoHw })
      j.planSummary = plan.summary
      j.planWarnings = plan.warnings
      if (!plan.ok) {
        j.error = plan.errors.join('\n')
        return this.finishJob(j, 'failed')
      }

      const target = resolveOutputTarget(
        j.inputPath,
        plan.container,
        settings.output,
        { res: plan.resLabel, codec: plan.codecLabel },
        this.reservedPaths(j.id)
      )
      if (!target.finalPath || !target.partPath) {
        j.outputPath = target.skippedBecauseExists ?? null
        j.error = `Skipped: ${path.basename(target.skippedBecauseExists ?? '')} already exists.`
        return this.finishJob(j, 'skipped')
      }
      j.outputPath = target.finalPath
      j.partPath = target.partPath
      await fsp.mkdir(path.dirname(target.finalPath), { recursive: true })

      const args = buildArgs(media, plan, target.partPath)
      j.command = formatCommand(caps.ffmpegPath, ['-nostats', '-progress', 'pipe:1', ...args])
      j.usedHwDecode = !!plan.hwDecode
      this.pushLog(j, `$ ${j.command}`)
      this.emitState(true)

      const handle = runFfmpeg(
        caps.ffmpegPath,
        args,
        media.duration,
        (p) => {
          j.progress = p.progress ?? (media.duration ? j.progress : null)
          j.speed = p.speed
          j.fps = p.fps
          j.etaSec = p.etaSec
          j.elapsedSec = (Date.now() - (j.startedAt ?? Date.now())) / 1000
          this.emitState()
        },
        (line) => this.pushLog(j, line)
      )
      j.handle = handle
      if (j.cancelRequested) handle.cancel()
      const result = await handle.promise
      j.handle = null

      if (result.ok) {
        await fsp.rename(target.partPath, target.finalPath)
        j.outputSizeBytes = safeSize(target.finalPath)
        j.progress = 1
        return this.finishJob(j, 'done')
      }
      await removeQuiet(target.partPath)
      if (result.cancelled || j.cancelRequested) return this.finishJob(j, 'cancelled')

      if (plan.hwDecode && !forceNoHw) {
        this.pushLog(j, '--- Failed with hardware decoding; retrying once with software decoding ---')
        j.outputPath = null
        return void this.launch(j, true)
      }
      j.error = result.error
      return this.finishJob(j, 'failed')
    } catch (e) {
      if (j.partPath) await removeQuiet(j.partPath)
      j.error = e instanceof Error ? e.message : String(e)
      return this.finishJob(j, 'failed')
    }
  }

  private finishJob(j: InternalJob, status: Job['status']): void {
    j.status = status
    j.finishedAt = Date.now()
    j.elapsedSec = j.startedAt ? (j.finishedAt - j.startedAt) / 1000 : null
    j.etaSec = null
    j.handle = null
    j.cancelRequested = false
    if (status !== 'done') j.partPath = null
    this.emitState(true)
    this.pump()
  }

  private checkFinished(): void {
    if (!this.running) return
    const active = this.activeCount()
    const queued = [...this.jobs.values()].some((j) => j.status === 'queued')
    if (active === 0 && (!queued || this.paused)) {
      if (this.paused && queued) {
        // paused with work left: stay "running" but idle
        return
      }
      this.running = false
      this.paused = false
      const summary = this.summary()
      this.runIds.clear()
      this.emitState(true)
      this.emit('finished', summary)
    }
  }

  private summary(): QueueFinishedSummary {
    const s: QueueFinishedSummary = { done: 0, failed: 0, cancelled: 0, skipped: 0, outputDirs: [] }
    const dirs = new Set<string>()
    for (const id of this.runIds) {
      const j = this.jobs.get(id)
      if (!j) continue
      if (j.status === 'done') {
        s.done++
        if (j.outputPath) dirs.add(path.dirname(j.outputPath))
      } else if (j.status === 'failed') s.failed++
      else if (j.status === 'cancelled') s.cancelled++
      else if (j.status === 'skipped') s.skipped++
    }
    s.outputDirs = [...dirs]
    return s
  }

  private pushLog(j: InternalJob, line: string): void {
    j.log.push(line)
    if (j.log.length > LOG_LIMIT) j.log.splice(0, j.log.length - LOG_LIMIT)
  }

  /** Cancel everything and wait (used on app quit so no ffmpeg is orphaned). */
  async shutdown(): Promise<void> {
    const running = [...this.jobs.values()].filter((j) => j.handle)
    this.cancelAll()
    await Promise.all(running.map((j) => j.handle?.promise))
  }
}

// ---------- helpers ----------

function newJob(inputPath: string): InternalJob {
  return {
    id: randomUUID(),
    inputPath,
    name: path.basename(inputPath),
    media: null,
    status: 'probing',
    progress: null,
    speed: null,
    fps: null,
    etaSec: null,
    elapsedSec: null,
    outputPath: null,
    planSummary: null,
    planWarnings: [],
    command: null,
    error: null,
    attempt: 0,
    usedHwDecode: false,
    startedAt: null,
    finishedAt: null,
    outputSizeBytes: null,
    settings: null,
    handle: null,
    cancelRequested: false,
    log: [],
    partPath: null
  }
}

function resetRun(j: InternalJob): void {
  j.progress = null
  j.speed = null
  j.fps = null
  j.etaSec = null
  j.elapsedSec = null
  j.outputPath = null
  j.planSummary = null
  j.planWarnings = []
  j.command = null
  j.error = null
  j.attempt = 0
  j.startedAt = null
  j.finishedAt = null
  j.outputSizeBytes = null
  j.cancelRequested = false
  j.log = []
}

function publicJob(j: InternalJob): Job {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { settings, handle, cancelRequested, log, partPath, ...pub } = j
  return { ...pub, planWarnings: [...pub.planWarnings] }
}

export function isVideo(p: string): boolean {
  return VIDEO_EXTENSIONS.includes(path.extname(p).slice(1).toLowerCase())
}

async function collectVideos(dir: string, depth: number): Promise<string[]> {
  if (depth < 0) return []
  let entries
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: string[] = []
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...(await collectVideos(full, depth - 1)))
    else if (e.isFile() && isVideo(full) && !/\.part\.\w+$/i.test(e.name)) out.push(full)
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

async function removeQuiet(p: string): Promise<void> {
  for (let i = 0; i < 5; i++) {
    try {
      if (!existsSync(p)) return
      await fsp.unlink(p)
      return
    } catch {
      // Windows may hold the handle briefly after the process exits
      await new Promise((r) => setTimeout(r, 300))
    }
  }
}

function safeSize(p: string): number | null {
  try {
    return statSync(p).size
  } catch {
    return null
  }
}
