# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Windows desktop app: Electron shell around a React renderer. Treated as web for design purposes. Min window 1000×700; must also hold up maximized on a 4K monitor.)

## Users

Intended for a **public release**: strangers who find the GitHub repo and have large video files to convert. The first and best-understood user is the author: a power user batch-converting big files (mostly 4K WebM screen/game recordings to MP4) on a Windows machine with an NVIDIA GPU. Session pattern: drop a handful of big files, glance at the detected specs, maybe change one or two settings, start, leave it running, come back.

Strangers will not know ffmpeg vocabulary (CRF/CQ, VFR, Main10, NVENC). The UI must serve the author's speed and a newcomer's confidence at once.

## Product Purpose

Convert media files in bulk with ffmpeg, with settings that default to "match the source" so most files need no decisions. Each file's real specs (resolution, frame rate incl. variable frame rate, bit depth / HDR, audio) are read from the file, and the UI shows what will happen before it happens. Success: the user drops files, trusts the defaults, and gets correct output without opening ffmpeg docs.

## Positioning

A GUI over ffmpeg that is honest about what it is doing: it shows the resolved plan per file (source specs → output specs), verifies hardware encoders actually work before using them, and never overwrites or damages originals. Neighbouring converters either hide the plan behind presets or expose raw ffmpeg flags; this one shows the plan and keeps the flags one click away ("Copy command").

## Operating Context

- Large inputs (multi-GB 4K files), long-running jobs, user often away from the screen: progress must be legible at a glance, and completion must be noticeable (Windows notification, taskbar flash).
- Whole window is a drop target; files can also be added via picker or folder.
- Runs a local ffmpeg/ffprobe (found on PATH or set manually); GPU encoders (NVENC, AMD AMF) are used when verified, with software fallback.
- Output goes next to the source or into a chosen folder, with a filename template and a conflict policy (rename / overwrite / skip). Output is written to a `.part` temp file and renamed on success.

## Capabilities and Constraints

- Today: **video only**. Containers MP4, MKV, MOV, WebM; codecs H.264, HEVC, AV1, VP9; copy-stream mode; scaling; constant or variable frame rate; HDR tone-mapping or 10-bit HEVC; audio AAC/Opus/copy/none; presets (built-in and user-saved); queue with concurrency, pause, cancel, retry; per-file log and copyable ffmpeg command.
- **Planned: audio and image conversion.** The engine is video-only today, so the UI must not hard-code "video" into its structure (file rows, settings, empty states) in a way that makes a second media type a rewrite. This is a structural constraint, not a request to design audio/image screens now.
- Hard architecture boundary: UI work may change only `src/renderer/components/**`, `src/renderer/styles/**` and the layout in `src/renderer/App.tsx`. Logic lives in `src/main`, `src/shared`, `src/preload` and `src/renderer/state` and must not change. If a hook is missing something, list it instead of adding it.
- Presentational components receive everything via props/hooks and never call `window.api`.
- Terminology already in use: Preset, Container, Constant quality, Match source, Re-encode / Copy, Queue, Convert.

## Brand Commitments

None confirmed. The current name, "File Converter", is a placeholder (the GitHub repo is `orkatoons/free-fire-converter`). The owner wants the app renamed to something **pop-culture-flavoured and relevant**; the name itself is **undecided**. No logo, wordmark or brand voice exists yet. Do not invent a name in UI copy; use the existing placeholder until a name is chosen.

Open product question for the owner: if the new name or branding draws on someone else's game, show or characters, check trademark and licensing before a public release.

## Evidence on Hand

- A working app with tested conversions (49 unit tests, 14 end-to-end tests against real ffmpeg).
- Synthetic test videos in `test-fixtures/` (gitignored; regenerate with `npm run fixtures`): 4K VP9+Opus WebM, a variable-frame-rate WebM, a WebM with no duration metadata, and a 10-bit HDR WebM. These can populate the UI for design review.
- Absent, and not to be fabricated: logo, screenshots for a README, user testimonials, download counts, a license, and an installer (`npm run dist` is configured but untested).

## Product Principles

0. **"As simple and as detailed as possible"** (owner's words, binding). Every fact about a file and its conversion is visible, not hidden behind hover or modes; the path for a newcomer stays one obvious line: add files → check → Convert. Simplicity comes from order and few control types, never from removing information.
1. **Show the plan before the work.** For every file, source specs and the resolved output are visible before conversion starts, along with anything that will be changed or lost (HDR, VFR, dropped subtitles, upscale blocked).
2. **Defaults carry the user.** "Match source" and a working preset mean a stranger can drop files and press Convert. Power settings exist but stay out of the way.
3. **Never harm the original.** Inputs are never overwritten; failed or cancelled jobs leave no half-written output. The UI should make that safety feel true, not just be true.
4. **Failures are explained in plain language** with the raw ffmpeg detail one click away, never the other way round.
5. **Media-agnostic structure.** Layout and components assume "files with specs and a plan", not "videos", so audio and images can be added without a redesign.

## Accessibility & Inclusion

Brief-defined requirements for the UI: fully keyboard-operable (Ctrl+O add files, Ctrl+Enter start, Delete remove selection, Ctrl+A select all, Esc close dialogs), visible focus, respects reduced motion, follows the OS light/dark theme. No further standard (e.g. WCAG level) has been specified by the owner.
