# MediaEditor

A video editor that runs entirely in your browser: import videos and photos, trim, split and
arrange them, add music, emoji, stickers and text, and export an MP4 you can save to your photo
gallery or share.

**Live app:** https://rubenvanputtenprive.github.io/mediaeditor/

**Private by design.** There is no server. Decoding, editing, rendering and encoding all happen on
your device; your videos are never uploaded. No accounts, no tracking, no cookies, no external
requests after the page loads.

## Features

- Import videos (MP4/MOV, H.264, and HEVC where the device can decode it) and photos from the
  camera roll or file system. Files a device cannot decode get a clear message naming the codec.
- Three tracks: video (with thumbnails), music, and overlays. The timeline starts at the left edge
  and is zoomed so the whole video fits the screen width on any device; the playhead moves across
  it. Tap or drag to move the playhead, pinch / Ctrl+wheel / buttons to zoom (the view follows the
  playhead), and **Fit** (or `0`) to see the whole video again.
- Trim clip start and end, split at the playhead, delete, drag to reorder, and set clip volume or mute.
- Music: import MP3, M4A or WAV, or pick one of the ten bundled CC0 tracks (pop, tropical, funk,
  rock, chiptune, synthwave, lo-fi, acoustic, piano, cinematic). Trim it, set its
  start, volume, fade-in and fade-out, and balance original audio against music.
- Emoji (Twemoji, searchable, by category), a sticker pack and text overlays. Each can be moved,
  scaled and rotated (drag, pinch/rotate, or the corner handle), with a start time and duration.
  Remove one with the red × on it in the preview or the Remove button in the side panel, or clear
  them all at once.
- **New video** in the top bar starts over (after a confirmation); the old edit and its imported
  files are removed from the device.
- Aspect ratios 16:9, 9:16 and 1:1, with fit or fill per clip.
- MP4 export (H.264 + AAC) at 720p or 1080p, with progress, estimated time and cancel. The screen
  stays awake during export. Afterwards you can **Share / Save to Photos** (Web Share API) or
  **Download**.
- Undo/redo, and autosave to IndexedDB so a refresh or app switch does not lose work.
- Installable PWA that works offline after the first visit.
- **Eight languages**: English, Nederlands, Deutsch, Français, Español, Português, Italiano and
  Polski. The app follows the device/browser language (`navigator.languages`) and falls back to
  English; About → Language overrides it and the choice is remembered. Emoji search uses names and
  keywords in the chosen language (English keywords keep working too).
- Keyboard shortcuts on desktop: Space play/pause, S split, Delete remove, Ctrl/Cmd+Z undo,
  Ctrl/Cmd+Shift+Z (or Ctrl+Y) redo, ←/→ step one frame (Shift: one second), Home/End, +/− zoom and 0 fit, with the timeline focused.

## Supported browsers

| Platform | Browser | Notes |
| --- | --- | --- |
| iPhone / iPad | Safari 16.4+ (and every iOS browser, all WebKit) | Save to Photos via Share → Save Video. Safari before 26 has no AAC encoder, so audio uses the bundled WASM AAC encoder. |
| Android phones and tablets | Chrome 94+ | Share to Photos/Gallery or download. |
| Windows | Chrome / Edge 94+ | Download to the Downloads folder. |
| Others | Firefox 130+, desktop Safari | Should work; where H.264 encoding is missing the ffmpeg fallback is used. |

## Encoder strategy

GitHub Pages cannot send the COOP/COEP headers that `SharedArrayBuffer` (and so multithreaded
ffmpeg.wasm) needs. The exporter therefore picks a path at runtime by **feature detection**, never
from the browser name:

1. **WebCodecs + [Mediabunny](https://mediabunny.dev)** (preferred). `VideoEncoder` encodes H.264,
   usually in hardware; `AudioEncoder` encodes AAC; Mediabunny muxes the MP4. Source frames are
   decoded with Mediabunny's `VideoSampleSink`, frame by frame, and closed right away.
2. **WebCodecs video + `@mediabunny/aac-encoder`** when H.264 encoding exists but AAC encoding does not
   (Safari before 26, Chrome on Linux). It is a single-threaded WASM build, so it needs no special headers.
3. **Single-threaded `@ffmpeg/core`** when WebCodecs H.264 encoding is unavailable. Frames are rendered
   to a canvas, written to ffmpeg's in-memory file system as JPEGs in 3-second batches, encoded with
   libx264 batch by batch and joined. This is slower but needs no `SharedArrayBuffer`. The ~31 MB core
   is fetched only when this path is used, then cached by the service worker.
   You can force this path for testing with `?encoder=ffmpeg`.

Audio for every path is mixed with `OfflineAudioContext` in 10-second windows. The original clip
audio is decoded with Mediabunny (or `decodeAudioData` as a fallback), and music gains and fades are
applied with gain automation. When the browser supports writable OPFS files, the MP4 is streamed to
disk instead of being held in memory.

The **preview** uses hidden `<video>` elements, which use hardware decoding and play smoothly on
phones, drawn onto a `<canvas>` with the overlays. Sound goes through Web Audio gain nodes, because
iOS ignores `media.volume`. Preview and export share the same drawing code.

## Known limits

- **Memory on mobile.** iOS kills tabs that use too much memory. The app streams frames instead of
  loading whole files, caps export at 1080p, downscales photos to 2048 px, and warns before importing
  clips over 10 minutes or 1 GB on phones and tablets. Very long 1080p exports on older iPhones may
  still fail. Use 720p if they do.
- **Without writable OPFS** (some Safari versions) the finished MP4 is assembled in memory, so
  roughly 60 MB per minute at 1080p must fit in RAM.
- The **ffmpeg fallback** is far slower than WebCodecs (several times real time at 1080p).
- **HEVC** imports work only where the device can decode HEVC (most Apple devices, some Android
  and Windows machines). Other devices show a "cannot play HEVC" message.
- Autosaved media is stored in this browser's storage. Clearing site data, or private browsing,
  removes it.
- Exports are 30 fps, and variable frame-rate sources are resampled to 30 fps.

## Run locally

```bash
npm install
npm run dev          # http://localhost:5173/mediaeditor/
npm test             # unit tests (Vitest)
npx playwright install chromium webkit
npm run test:e2e     # builds, serves, and runs the browser tests
npm run build        # production build in dist/
```

`npm run dev` and `npm run build` first run `scripts/prepare-assets.mjs`. It copies the Twemoji
SVGs, the emoji search index and the ffmpeg core into `public/` (these are generated and not
committed).

## Tests

- **Unit (Vitest):** time math, timeline operations (split, trim, reorder, delete) and undo/redo
  with gesture coalescing (`src/model/*.test.ts`).
- **End-to-end (Playwright):** Chromium and WebKit desktop plus iPhone 13, Pixel 7 and iPad
  emulation. The tests import a sample clip, split it, add two emoji, a sticker and music with a
  fade-out, export, and check with Mediabunny that the file is an MP4 with H.264 + AAC of the right
  size and duration. Desktop runs also cover keyboard shortcuts, undo/redo, autosave across reload,
  and the ffmpeg fallback. A layout test checks phone, landscape, tablet and desktop sizes: the page
  is never wider than the screen, the video is centred, and the timeline starts at the left and fits
  the width. A content test (`tests/e2e/content.spec.ts`, needs `ffmpeg` on PATH)
  exports at 1080p and decodes the result: the emoji and sticker must appear in the frame only
  during their set times, and the music must be audible and fade out at the end.

Emulation is not a real device: WebKit on Linux is not iOS Safari, and emulated phones have desktop
memory and codecs. See *Device verification* below.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`. It installs dependencies, runs the unit
tests, builds with Vite (`base: /mediaeditor/`) and deploys with `actions/upload-pages-artifact` and
`actions/deploy-pages`. Pages is configured with source "GitHub Actions".

## Device verification

The automated checks above run in emulation. Before calling a release good, check on real devices:
iPhone (Safari → Share → Save Video → play in Photos), an Android phone (Chrome → Share → Photos/
Gallery) and Windows (Chrome or Edge → Download → play in the Films & TV / Media Player app).

## Asset licenses

- **Emoji graphics:** [Twemoji](https://github.com/jdecked/twemoji) 15 by Twitter, Inc. and other
  contributors, [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credited in the app's
  About screen.
- **Emoji names and keywords:** [Emojibase](https://emojibase.dev), MIT.
- **Stickers** (`public/stickers/`): made for this project, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- **Music** (`public/music/`): ten tracks synthesised from code by `scripts/make-music.py` for
  this project, no samples, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
  No copyrighted music is bundled.
- **Fonts:** Bricolage Grotesque, Inter, Bebas Neue and Pacifico (SIL OFL 1.1); Permanent Marker
  and Roboto Slab (Apache 2.0). Bundled through Fontsource.
- **Libraries:** Mediabunny and @mediabunny/aac-encoder (MPL-2.0), ffmpeg.wasm (MIT; the core is
  built from FFmpeg/x264, LGPL/GPL), React (MIT), Zustand (MIT), idb (ISC), Workbox (MIT).

## Project layout

```
src/model      project types, time math, timeline ops, undo/redo (pure, unit-tested)
src/state      Zustand store
src/media      import/probe, IndexedDB/OPFS storage, thumbnails, images
src/preview    playback engine (video elements → canvas, Web Audio)
src/render     shared frame/overlay drawing, emoji/sticker assets, bundled music list
src/export     exporter (WebCodecs/Mediabunny), ffmpeg fallback, audio mixer
src/ui         React components and styles
src/i18n       UI strings: en.ts (source), locales/<code>.ts, locales.json (list), strings.ts (t(), detection)
```

Planned later features (transitions, filters, speed, voice-over, animated stickers, project files)
are described in `docs/plan.md`. The data model already reserves `speed` on clips.

## Adding a language

1. Add `{ "code": "xx", "name": "Native name" }` to `src/i18n/locales.json`.
2. Copy `src/i18n/locales/nl.ts` to `src/i18n/locales/xx.ts` and translate every value. Keep the
   `{placeholders}`. TypeScript and `src/i18n/strings.test.ts` fail if a key or placeholder is missing.
3. Emoji names come from `emojibase-data/xx` when it exists. Otherwise the emoji index falls back to English.

