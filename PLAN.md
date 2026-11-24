# File Converter — Plan

A desktop app: drop or open video files, read their real specs with ffprobe, convert them with ffmpeg
using settings that default to "match the source", across a queue of multiple files, into a chosen output folder.

The first use case is **4K WebM → MP4**. The app should handle other inputs too, but the defaults are tuned for this one.

## Environment (checked 2026-11-24)
- ffmpeg 9.0.2 (gyan.dev essentials build) and ffprobe are on PATH (`C:\ProgramData\chocolatey\bin`)
- Node 22.11, npm 10.9. No Rust toolchain, so Tauri is out.
- GPU: RTX 4050 Laptop. ffmpeg has `h264_nvenc`, `hevc_nvenc` and `av1_nvenc`, plus AMD `*_amf`, `libx264`, `libx265`, `aac` and `libopus`.

## Key decisions
| Decision | Choice | Why |
|---|---|---|
| Shell | **Electron + electron-vite + React + TypeScript** | A browser page can't get real file paths from a drag-and-drop, so it can't run ffmpeg on them; Electron can. It's also a web frontend, which is what impeccable works on. |
| Split | Logic in `main/` + `shared/` + a renderer store. UI in `renderer/components` + `renderer/styles` only | This lets Prompt 2 restyle everything without touching any conversion logic |
| Default video | `h264_nvenc`, CQ quality mode, match source resolution and fps, `yuv420p` | 4K H.264 MP4 plays everywhere, and NVENC makes 4K fast |
| 10-bit / HDR sources | Detect them, warn, and default to `hevc_nvenc` Main10 | H.264 8-bit would crush HDR |
| Audio | Opus/Vorbis → AAC (192k default; keep the source channel count) | Opus-in-MP4 has spotty player support |
| Fast path | "Copy streams (no re-encode)" when the codecs fit in MP4 (e.g. AV1 + AAC) | Instant and lossless when possible |

## Build order
1. **Prompt 1 (below)**: the full engine plus a plain but fully usable UI. You can convert your files right after this.
2. **Prompt 2 (below)**: run through impeccable to design the UI. It's limited to presentation files only.

---

## PROMPT 1 — Engine + functional UI

```
Build a desktop video converter in this folder (it's empty). Stack: Electron + electron-vite + React + TypeScript, vitest for tests. ffmpeg/ffprobe are on PATH (ffmpeg 9.0.2); the machine has an RTX 4050 (NVENC) and AMD iGPU (AMF).

PRIMARY USE CASE: I have 4K .webm files (likely VP9/AV1 + Opus, possibly variable frame rate, possibly missing duration metadata — MediaRecorder/OBS style) and I want .mp4 out, matching the source's resolution, fps and quality as closely as practical. Multiple files at once.

ARCHITECTURE (strict — a later pass will redesign the UI and must not need to touch logic):
- src/shared/types.ts — MediaInfo, ConvertSettings, Job, JobStatus, Capabilities, IPC channel names + event payloads. Single source of truth.
- src/main/ffmpeg/locate.ts — find ffmpeg/ffprobe (custom path setting > PATH). 
- src/main/ffmpeg/capabilities.ts — on startup: ffmpeg version, list encoders, and actually VERIFY hardware encoders work with a 1-frame lavfi test encode to null (listed ≠ usable). Cache result.
- src/main/ffmpeg/probe.ts — ffprobe -print_format json -show_format -show_streams. Extract: container, duration, size, overall bitrate, video codec/profile, width/height, avg & r frame rate (flag VFR when they differ), pix_fmt, bit depth, color primaries/transfer/space (flag HDR for smpte2084/arib-std-b67), rotation; audio codec, channels, sample rate, bitrate; subtitle streams count. If duration is missing/N/A (common for webm), fall back to a demux-only pass (ffmpeg -i f -map 0:v:0 -c copy -f null -) and read the last time= value.
- src/main/ffmpeg/args.ts — PURE function buildArgs(media: MediaInfo, settings: ConvertSettings, outPath): string[]. No I/O. This is where all codec logic lives. Also export a formatter for a copy-pasteable command string.
- src/main/ffmpeg/runner.ts — spawn ffmpeg with `-hide_banner -nostats -progress pipe:1 -y`, parse out_time_us/speed/fps into progress %, ETA; keep last ~200 stderr lines for error reporting. Cancel = write "q" to stdin, hard kill after 3s; delete the partial output file on cancel or failure. Write to "<name>.part.mp4" then rename on success.
- src/main/queue.ts — job queue with configurable concurrency (default 1), start/pause-after-current/cancel one/cancel all/retry. If a job fails with hardware decode enabled, auto-retry once without hwaccel.
- src/main/settings.ts — persist settings + user presets as JSON in app.getPath('userData').
- src/main/ipc.ts + src/preload/index.ts — contextIsolation on, nodeIntegration off, sandbox on. Expose a typed window.api: getCapabilities, probe(paths), pickFiles, pickOutputFolder, getPathForFile(File) (use webUtils.getPathForFile for drag-drop), previewCommand(jobId), enqueue/start/cancel/cancelAll/retry/remove/clearFinished, revealInFolder, openFile, load/saveSettings, list/save/deletePreset, and event subscriptions onJobUpdate/onJobLog that return unsubscribe fns.
- src/renderer/state/ — ALL renderer state and behavior (zustand or useReducer + context): file list, selection, settings, queue sync from main events, derived values (total progress, can-start, warnings). Components must get everything via hooks from here.
- src/renderer/components/ — dumb presentational components only (props in, callbacks out). No window.api calls in components.
- src/renderer/styles/tokens.css — CSS custom properties for colors/spacing/type/radius; all other CSS uses them. Plain, clean, readable — don't invest in visual design, it gets redone later.

SETTINGS (global, applied to every file; "Match source" resolves per-file from its own probe):
- Output container: mp4 (default), mkv, mov, webm.
- Mode: Re-encode (default) | Copy streams (only enabled when source codecs are valid in the target container; explain why when disabled).
- Video encoder: auto-pick best verified: h264_nvenc > h264_amf > libx264 for H.264; same pattern for HEVC and AV1. User can pick codec (H.264/HEVC/AV1) and specific encoder.
- Quality: Constant quality (default; nvenc `-rc vbr -cq N -b:v 0`, x264/x265 `-crf N`; default ~19 for H.264, 23 HEVC/AV1) | Target bitrate (Mbps, with a "match source bitrate" button) .
- Speed preset: mapped per encoder (nvenc p1–p7 default p5 + -tune hq; x264 ultrafast..veryslow default medium).
- Resolution: Match source (default) | 2160p | 1440p | 1080p | 720p | custom; never upscale unless explicitly ticked; keep aspect, even dimensions.
- Frame rate: Match source (default; passthrough timing, keeps VFR) | Constant at source avg fps ("for video editors" — explain VFR issue) | 60/30/24/custom.
- Pixel format/bit depth: auto — 8-bit yuv420p for H.264; if source is 10-bit or HDR, show a warning and default codec to HEVC Main10 (p010le / yuv420p10le) preserving color metadata (-color_primaries/-color_trc/-colorspace). 
- Hardware decode: toggle, default on when NVENC verified (-hwaccel cuda without keeping frames on GPU unless no filters are needed).
- Audio: AAC (default) | Opus | Copy | None; bitrate (default 192k), keep channel count; for MP4 transcode Opus/Vorbis → AAC.
- Always for mp4/mov: -movflags +faststart, -map 0:v:0 -map 0:a? (first video + all audio), map_metadata 0. Subtitles: drop for mp4 unless mov_text-convertible text subs; keep for mkv.
- Output: folder picker | "Same folder as source" (default); filename template with {name} {res} {codec} {date} (default "{name}"); on conflict: auto-rename (default) / overwrite / skip.
- Concurrency: 1–4 (default 1).
- Built-in preset "WebM → MP4 (match source, GPU)" selected by default; user can save/load own presets.

FUNCTIONAL UI (single window, min 1000×700):
- Whole window is a drop target + "Add files" button (filter common video extensions, multi-select) + "Add folder". Dedupe by path. Non-video drops get a non-blocking notice.
- File list: name, detected specs (e.g. "3840×2160 · VP9 · 59.94 fps VFR · 10-bit HDR · Opus 2ch · 12:34 · 1.8 GB"), status, progress bar, ETA/speed, per-row actions (remove, cancel, retry, reveal output, show log, copy ffmpeg command). Multi-select + remove selected; clear finished.
- Settings panel with everything above; per-file warnings (HDR, VFR, upscale blocked, copy-mode unavailable).
- Footer: output location, Start / Cancel all, overall progress.
- Startup states: ffmpeg not found (let me set a path), no hardware encoder verified (fall back to software, say so).
- Windows notification + optional "open folder" when the queue finishes.

TESTS / VERIFICATION (do these, don't just write them):
- vitest unit tests for buildArgs covering: 4K VP9+Opus webm → mp4 h264_nvenc; 10-bit HDR → hevc Main10 w/ color metadata; copy mode allowed/disallowed; downscale keeps aspect + even dims; no-upscale guard; CFR vs passthrough; audio none/copy; software fallback.
- Generate fixtures with ffmpeg lavfi into a gitignored test-fixtures/: a 3840×2160 VP9+Opus webm (~5s, testsrc2 + sine), a VFR one, and one with stripped duration (pipe through a live-style mux). Run a real end-to-end conversion through the main-process code (not the UI) and assert the output via ffprobe: h264, 3840×2160, matching fps, aac audio, duration within 0.2s.
- npm run dev must launch; npm run build must pass typecheck.

Add a short README: how to run, how to build a Windows installer (electron-builder, nsis), architecture map showing which folders are logic vs presentation.
```

---

## PROMPT 2 — UI design pass (run via impeccable after Prompt 1 is done and working)

Impeccable is installed at project scope (`.claude/skills/impeccable`, hooks in `.claude/settings.local.json`).
After reloading Claude Code: run `/impeccable init` first (writes PRODUCT.md — the product context below answers its questions), then send:

```
/impeccable Redesign the UI of this Electron video converter (a full redesign — treat the current plain look as an anti-reference, not something to polish). Mode: Operate.

HARD BOUNDARY: only edit src/renderer/components/**, src/renderer/styles/**, src/renderer/App.tsx layout, and add assets/fonts. Do NOT change src/main, src/preload, src/shared, or src/renderer/state — consume the existing hooks/props as-is. If a hook is genuinely missing something the design needs, list it at the end instead of adding it.

PRODUCT CONTEXT:
- Personal power-user tool for batch-converting large video files (mostly 4K WebM → MP4) with ffmpeg on Windows. Sessions are: drop a handful of big files, glance at detected specs, maybe tweak one or two settings, hit start, leave it running, come back.
- Priorities: (1) instant confidence about what WILL happen (source specs → output specs at a glance), (2) progress readable from across the room, (3) settings power without clutter — sensible defaults visible, advanced stuff tucked away.
- Desktop only, min window 1000×700, should also look good maximized on a 4K monitor. Dark and light themes following the OS.

STATES TO DESIGN (all exist in the current functional UI):
- Empty: full-window drop invitation + Add files / Add folder.
- Drag-over: clear drop affordance over the whole window, including when files are already listed.
- Files listed, idle: per-file source specs, per-file warnings (HDR, VFR, copy-mode unavailable, upscale blocked), resolved output summary per file (e.g. "→ 3840×2160 H.264 NVENC · AAC 192k · .mp4").
- Settings: preset picker first; simple controls up front (container, codec, quality, resolution, fps, audio, output location, conflict policy); advanced collapsed (encoder override, speed preset, bitrate mode, hw decode, concurrency, filename template, ffmpeg path). Copy-the-command affordance.
- Running: per-row progress, speed (e.g. 2.3×), ETA, overall progress; cancel one / cancel all.
- Done / failed / cancelled / skipped rows; failed rows expose the ffmpeg log tail and retry.
- Queue finished summary with "Open output folder".
- Error/system states: ffmpeg not found (path setter), no GPU encoder verified (software fallback notice), unknown-duration files (indeterminate progress).

Keep it fully keyboard-accessible (Ctrl+O add files, Delete removes selection, Ctrl+Enter starts, Ctrl+A select all, Esc closes dialogs), visible focus, respect reduced motion. Verify by looking at the running app (npm run dev) — to populate it with real files, the test fixtures in test-fixtures/ can be added via window.api.addPaths from DevTools. npm run build and npm test must still pass.
```

Then finish with `/impeccable critique`, `/impeccable audit`, and `/impeccable polish` on the parts that need it.
