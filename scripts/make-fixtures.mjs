// Generates synthetic test videos into test-fixtures/ (skips ones that already exist).
import { spawn, spawnSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

const dir = path.resolve('test-fixtures')
mkdirSync(dir, { recursive: true })

function ff(args, label) {
  process.stdout.write(`  ${label}… `)
  const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] })
  if (r.status !== 0) {
    console.log('FAILED')
    process.exit(1)
  }
  console.log('ok')
}

const out = (name) => path.join(dir, name)
const need = (name) => !existsSync(out(name)) || statSync(out(name)).size === 0

console.log(`Fixtures in ${dir}`)

// 1) 4K 30fps VP9 + Opus WebM, 5 s
if (need('4k-vp9-opus.webm')) {
  ff(
    [
      '-f', 'lavfi', '-i', 'testsrc2=s=3840x2160:r=30:d=5',
      '-f', 'lavfi', '-i', 'sine=f=440:d=5:sample_rate=48000',
      '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', '-b:v', '8M',
      '-c:a', 'libopus', '-b:a', '128k', '-shortest',
      out('4k-vp9-opus.webm')
    ],
    '4k-vp9-opus.webm'
  )
}

// 2) Variable frame rate: 2 s @ 30 fps then 2 s @ 15 fps
if (need('vfr.webm')) {
  ff(
    [
      '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=2',
      '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=15:d=2',
      '-f', 'lavfi', '-i', 'sine=f=330:d=4:sample_rate=48000',
      '-filter_complex', '[0:v]settb=1/1000[a];[1:v]settb=1/1000[b];[a][b]concat=n=2:v=1:a=0[v]',
      '-map', '[v]', '-map', '2:a',
      '-fps_mode', 'passthrough',
      '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '1M',
      '-c:a', 'libopus', '-b:a', '96k',
      out('vfr.webm')
    ],
    'vfr.webm'
  )
}

// 3) WebM with no duration/cues (like MediaRecorder / live streams): mux through a pipe with -live 1
if (need('no-duration.webm')) {
  ff(
    [
      '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=4',
      '-f', 'lavfi', '-i', 'sine=f=550:d=4:sample_rate=48000',
      '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '2M',
      '-c:a', 'libopus', '-b:a', '96k', '-shortest',
      out('tmp-src.webm')
    ],
    'tmp-src.webm'
  )
  process.stdout.write('  no-duration.webm… ')
  const p = spawn('ffmpeg', ['-hide_banner', '-v', 'error', '-i', out('tmp-src.webm'), '-c', 'copy', '-f', 'webm', '-live', '1', 'pipe:1'])
  p.stderr.pipe(process.stderr)
  const exited = new Promise((resolve) => p.on('close', resolve))
  await pipeline(p.stdout, createWriteStream(out('no-duration.webm')))
  const code = await exited
  if (code !== 0) {
    console.log('FAILED')
    process.exit(1)
  }
  unlinkSync(out('tmp-src.webm'))
  console.log('ok')
}

// 4) 10-bit HDR10-tagged VP9 (profile 2)
if (need('hdr10.webm')) {
  ff(
    [
      '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=3',
      '-f', 'lavfi', '-i', 'sine=f=660:d=3:sample_rate=48000',
      '-vf', 'format=yuv420p10le,setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc:range=tv',
      '-c:v', 'libvpx-vp9', '-profile:v', '2', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '2M',
      '-color_primaries', 'bt2020', '-color_trc', 'smpte2084', '-colorspace', 'bt2020nc', '-color_range', 'tv',
      '-c:a', 'libopus', '-b:a', '96k', '-shortest',
      out('hdr10.webm')
    ],
    'hdr10.webm'
  )
}

console.log('Done.')
