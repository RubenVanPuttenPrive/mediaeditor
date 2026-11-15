# MediaEditor — implementation plan

## Architecture in one paragraph
Static Vite + React + TypeScript app on GitHub Pages (`base: /mediaeditor/`). All media stays on the
device. A single serializable **project** (Zustand) holds a video track, a music track and an overlay
track; an immutable snapshot history gives undo/redo. **Preview** draws `<video>` elements (hardware
decode, smooth on phones) and overlays onto one `<canvas>`; audio goes through Web Audio gain nodes
(iOS ignores `video.volume`). **Export** is a separate, lazy-loaded module that renders frame by frame
into an offscreen canvas and encodes MP4 (H.264 + AAC).

## Encoder strategy (GitHub Pages cannot send COOP/COEP)
Feature-detected at runtime, never from the user agent:
1. **WebCodecs + Mediabunny** — `canEncodeVideo('avc')`; frames decoded with Mediabunny
   `VideoSampleSink`, encoded with `CanvasSource`, muxed with `Mp4OutputFormat`.
2. **Same, with `@mediabunny/aac-encoder`** (WASM, single-threaded, no SAB) when the browser has
   `VideoEncoder` but no native AAC `AudioEncoder` (e.g. Safari before 26).
3. **Single-threaded `@ffmpeg/core`** when H.264 encoding via WebCodecs is missing. Frames come from
   seeking `<video>` elements, are written as JPEG to ffmpeg's FS and encoded with libx264. Slow, but
   it needs no `SharedArrayBuffer`. Loaded only on demand.

Audio export mixes in `OfflineAudioContext` in 10 s windows so long projects never hold the whole
mix in memory.

## Data model (src/model)
- `Media { id, name, kind: video|image|audio, duration, width, height, hasAudio }` — blobs in IndexedDB.
- `VideoClip { id, mediaId, in, out, speed(=1, reserved), volume, muted, fit: contain|cover }`,
  laid out back to back.
- `MusicClip { id, mediaId, start, in, out, volume, fadeIn, fadeOut }`.
- `Overlay { id, kind: emoji|sticker|text, start, duration, x, y, scale, rotation, ...style }`.
- `Project { aspect: 16:9|9:16|1:1, balance, clips, music, overlays }`.
Later features slot in as fields (`speed`, `transition`, `filters`) and new overlay kinds.

## Slices (each ends deployed)
a. Skeleton, Pages workflow, PWA shell, strings file, About screen.
b. Import (codec check, size warning), timeline (3 tracks, thumbnails, zoom, scrub), preview,
   trim/split/delete/reorder/volume, undo/redo, autosave.
c. Export via WebCodecs/Mediabunny (+ffmpeg fallback), progress/ETA/cancel, Wake Lock, Share/Download.
d. Music import, bundled CC0 tracks, trim/start/volume/fades, balance slider.
e. Twemoji picker (lazy), sticker pack, text overlays, move/scale/rotate (pinch), timing.
f. Accessibility, keyboard shortcuts, offline polish, README.

## Tests
- Vitest: time math, timeline operations, history (undo/redo/coalescing).
- Playwright (Chromium, WebKit, iPhone/Pixel/iPad emulation): import sample clip, add emoji,
  export, validate MP4 (duration, streams) with ffprobe-equivalent.

## Assets and licenses
- Emoji: Twemoji 15 (graphics CC-BY 4.0), metadata from emojibase-data (MIT).
- Stickers: drawn for this project, CC0.
- Music: synthesized for this project by a script in `scripts/`, released CC0.
- Fonts: OFL fonts via @fontsource, bundled.
