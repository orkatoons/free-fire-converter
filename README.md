# File Converter

Desktop batch video converter built on ffmpeg. Drop files in, it reads each one's real specs (resolution, fps, VFR, bit depth/HDR, audio) and converts with settings that default to **match source**. Tuned for 4K WebM → MP4 on an NVIDIA GPU, but handles other inputs/containers too.

## Run

Requires Node 22+ and ffmpeg + ffprobe on PATH (or set the folder in Advanced → "Use a different ffmpeg…").

```
npm install
npm run dev        # development with hot reload
npm run build      # typecheck + production bundle into out/
npm start          # run the built bundle
npm test           # unit tests (planner, ffmpeg args, output naming, probe parsing)
npm run e2e        # generates 4K/VFR/no-duration/HDR fixtures, runs real conversions, verifies with ffprobe
npm run dist       # Windows installer (NSIS) into release/
```

Keyboard: `Ctrl+O` add files · `Ctrl+Enter` start · `Del` remove selected · `Ctrl+A` select all · `Esc` close dialog.

## What it decides for you

| Situation | Behaviour |
|---|---|
| Default | H.264, best verified encoder (NVENC → AMF → x264), constant quality, source resolution + fps, 8-bit yuv420p, AAC 192k, `+faststart` |
| Opus/Vorbis audio into MP4 | Converted to AAC (Opus-in-MP4 has patchy player support) |
| 10-bit / HDR source | Warning, and H.264 is switched to HEVC Main10 with colour metadata preserved. "Convert to SDR / 8-bit" tone-maps instead |
| Variable frame rate | Kept by default; "Constant, at source fps" for editors |
| WebM with no duration/odd frame rate | Measured with a demux-only pass, so progress and VFR detection still work |
| Hardware decode fails | Retried once automatically with software decode |
| GPU encoder listed but broken | Every hardware encoder is verified with a real 1-frame test encode at startup; unusable ones are never picked |
| Output exists | Add number / overwrite / skip. Never overwrites the input; two inputs can't claim the same output |
| Cancel / failure | ffmpeg is stopped, the `.part.mp4` temp file is deleted. Output is only renamed into place on success |

## Architecture — logic vs presentation

```
src/
  shared/                 LOGIC (pure, no I/O) — used by main AND renderer
    types.ts              every data shape
    plan.ts               resolvePlan(): source specs + settings + capabilities -> what will happen + warnings
    encoders.ts           encoder tables, per-encoder speed/quality mapping, container compatibility
    defaults.ts           default settings + built-in presets
    format.ts             byte/duration/fps/spec-chip formatting
    ipc.ts                IPC channel names + the typed window.api contract
  main/                   LOGIC — Electron main process
    ffmpeg/args.ts        buildArgs(): plan -> ffmpeg argv (pure) + formatCommand()
    ffmpeg/probe.ts       ffprobe + scan fallback
    ffmpeg/capabilities.ts  detect ffmpeg, encoders, hwaccels; verify hardware encoders
    ffmpeg/runner.ts      spawn ffmpeg, parse -progress, cancel
    ffmpeg/locate.ts, proc.ts
    queue.ts              job queue (Electron-free; e2e tests drive it directly)
    outputs.ts            output path / template / conflict resolution
    settings.ts, ipc.ts, index.ts
  preload/index.ts        LOGIC — contextBridge -> window.api (sandboxed, contextIsolation on)
  renderer/
    state/store.ts        LOGIC — all renderer state + actions (zustand); the ONLY place that calls window.api
    state/hooks.ts        LOGIC — derived view models (rows, totals, settings model), drag-drop, shortcuts
    App.tsx               composition: hooks -> component props
    components/           PRESENTATION — props in, callbacks out, no window.api
    styles/               PRESENTATION — tokens.css (all design values) + app.css
```

To restyle: edit `renderer/components/**`, `renderer/styles/**`, `App.tsx` layout. Nothing else needs to change.

## Notes

- Settings and presets are saved in the Electron `userData` folder (`settings.json`).
- "Copy command" gives the exact ffmpeg invocation for a file under the current settings.
- Fixtures for tests are generated into `test-fixtures/` (gitignored).
