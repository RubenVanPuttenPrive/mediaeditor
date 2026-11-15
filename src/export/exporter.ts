// MP4 export (H.264 + AAC). Loaded lazily the first time the user exports.
//
// Path selection is pure feature detection:
//   1. WebCodecs VideoEncoder + AudioEncoder, muxed by Mediabunny           ("webcodecs")
//   2. WebCodecs video + Mediabunny's WASM AAC encoder when AAC is missing  ("webcodecs-wasm-aac")
//   3. Single-threaded ffmpeg.wasm when H.264 encoding is unavailable       ("ffmpeg")
import {
  AudioSample, AudioSampleSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, StreamTarget, canEncodeAudio, canEncodeVideo,
} from 'mediabunny';
import { FPS, locate, outputSize, projectDuration } from '../model/time';
import type { MediaInfo, Project } from '../model/types';
import { drawBase, drawOverlays, type Ctx2D } from '../render/compose';
import { ensureOverlayAssets } from '../render/assets';
import { openAudioReader, openFrameReader, type AudioReader, type FrameReader } from './sources';
import { MIX_WINDOW, SAMPLE_RATE, mixWindow } from './mix';

export type ExportMethod = 'webcodecs' | 'webcodecs-wasm-aac' | 'ffmpeg';

export interface ExportProgress {
  stage: 'loading' | 'rendering' | 'finishing';
  /** 0..1 */
  progress: number;
  /** Seconds remaining, once it can be estimated. */
  eta: number | null;
}

export interface ExportRequest {
  project: Project;
  media: Record<string, MediaInfo>;
  shortSide: 720 | 1080;
  signal: AbortSignal;
  onProgress: (p: ExportProgress) => void;
  /** Testing hook: force a path (also settable with ?encoder=ffmpeg). */
  forceMethod?: ExportMethod;
}

export interface ExportResult {
  file: File;
  method: ExportMethod;
  width: number;
  height: number;
  duration: number;
  downscaled: boolean;
}

const VIDEO_BITRATE = { 720: 5_000_000, 1080: 8_000_000 } as const;
const AUDIO_BITRATE = 160_000;

export async function chooseMethod(width: number, height: number, shortSide: 720 | 1080) {
  const forced = new URLSearchParams(location.search).get('encoder');
  if (forced === 'ffmpeg') return { method: 'ffmpeg' as const, width, height, downscaled: false };
  if (typeof VideoEncoder !== 'undefined') {
    const ok = await canEncodeVideo('avc', { width, height, bitrate: VIDEO_BITRATE[shortSide] }).catch(() => false);
    let size = { width, height, downscaled: false };
    if (!ok && shortSide === 1080) {
      const small = { width: Math.round((width * 2) / 3 / 2) * 2, height: Math.round((height * 2) / 3 / 2) * 2 };
      if (await canEncodeVideo('avc', { ...small, bitrate: VIDEO_BITRATE[720] }).catch(() => false)) size = { ...small, downscaled: true };
      else size = { width: 0, height: 0, downscaled: false };
    } else if (!ok) size = { width: 0, height: 0, downscaled: false };
    if (size.width > 0) {
      const aac = typeof AudioEncoder !== 'undefined' &&
        (await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: AUDIO_BITRATE }).catch(() => false));
      return { method: (aac ? 'webcodecs' : 'webcodecs-wasm-aac') as ExportMethod, ...size };
    }
  }
  return { method: 'ffmpeg' as const, width, height, downscaled: false };
}

export function exportFileName() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `MediaEditor-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.mp4`;
}

/** Writes to a file in the origin-private file system when possible, so the MP4 is not held in RAM. */
async function openOpfsTarget() {
  try {
    if (!navigator.storage?.getDirectory) return null;
    const dir = await navigator.storage.getDirectory();
    // Remove earlier exports; each export gets a fresh name so a File from a previous run stays valid until then.
    for await (const name of (dir as FileSystemDirectoryHandle & { keys(): AsyncIterable<string> }).keys()) {
      if (name.startsWith('export-')) await dir.removeEntry(name).catch(() => null);
    }
    const handle = await dir.getFileHandle(`export-${Date.now()}.mp4`, { create: true });
    if (typeof (handle as FileSystemFileHandle & { createWritable?: unknown }).createWritable !== 'function') return null;
    const writable = await handle.createWritable();
    return { handle, writable };
  } catch {
    return null;
  }
}

export function makeCanvas(width: number, height: number): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: Ctx2D } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha: false }) as OffscreenCanvasRenderingContext2D | null;
    if (ctx) return { canvas, ctx };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d', { alpha: false })! };
}

/**
 * Walks the timeline frame by frame, calling `emit` after each frame is drawn. Shared by the WebCodecs
 * and ffmpeg paths. Frame readers are opened per clip and closed as soon as the clip is done.
 */
export async function renderFrames(
  req: ExportRequest, ctx: Ctx2D, width: number, height: number, preferElement: boolean,
  emit: (frame: number, t: number) => Promise<void>, beforeFrame?: (t: number) => Promise<void>,
) {
  const { project, media, signal } = req;
  const duration = projectDuration(project);
  const total = Math.max(1, Math.round(duration * FPS));
  let f = 0;
  while (f < total) {
    if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
    const t = f / FPS;
    const loc = locate(project.clips, t);
    if (!loc) {
      // No clip under the playhead (overlay-only project): black frames with overlays.
      await beforeFrame?.(t);
      drawBase(ctx, width, height, null, 'contain');
      drawOverlays(ctx, width, height, project.overlays, t);
      await emit(f, t);
      f++;
      continue;
    }
    // Every frame that falls in this clip, with its source time.
    const frames: { f: number; t: number; src: number }[] = [];
    for (let g = f; g < total; g++) {
      const l = locate(project.clips, g / FPS);
      if (!l || l.index !== loc.index) break;
      frames.push({ f: g, t: g / FPS, src: l.sourceTime });
    }
    const m = media[loc.clip.mediaId];
    let reader: FrameReader | null = null;
    try {
      reader = m ? await openFrameReader(m, preferElement) : null;
      if (reader) {
        let i = 0;
        for await (const visual of reader.frames(frames.map((x) => x.src), signal)) {
          const fr = frames[i++];
          if (!fr) break;
          await beforeFrame?.(fr.t);
          drawBase(ctx, width, height, visual, loc.clip.fit);
          drawOverlays(ctx, width, height, project.overlays, fr.t);
          await emit(fr.f, fr.t);
        }
      } else {
        for (const fr of frames) {
          drawBase(ctx, width, height, null, 'contain');
          drawOverlays(ctx, width, height, project.overlays, fr.t);
          await emit(fr.f, fr.t);
        }
      }
    } finally {
      reader?.close();
    }
    if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
    f = frames[frames.length - 1].f + 1;
  }
  return total;
}

/** Opens one audio reader per media file used by the project. */
export async function openAudioReaders(project: Project, media: Record<string, MediaInfo>) {
  const decodeCtx = new OfflineAudioContext(2, 1, SAMPLE_RATE);
  const video = new Map<string, AudioReader>();
  const music = new Map<string, AudioReader>();
  for (const c of project.clips) {
    const m = media[c.mediaId];
    if (m && !video.has(m.id) && !c.muted) video.set(m.id, await openAudioReader(m, decodeCtx));
  }
  for (const c of project.music) {
    const m = media[c.mediaId];
    if (m && !music.has(m.id)) music.set(m.id, await openAudioReader(m, decodeCtx));
  }
  return { video, music, close: () => [...video.values(), ...music.values()].forEach((r) => r.close()) };
}

/**
 * Feeds the mixed audio to the encoder one AAC frame (1024 samples) at a time with explicit
 * timestamps. Some encoders (seen in WebKit) stamp every packet of a large input with the same
 * time, which produces non-monotonic timestamps in the file.
 */
async function addAudioFrames(source: AudioSampleSource, buf: AudioBuffer, startTime: number) {
  const FRAME = 1024;
  const ch = buf.numberOfChannels;
  const channels = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  const startFrame = Math.round(startTime * SAMPLE_RATE);
  for (let i = 0; i < buf.length; i += FRAME) {
    const n = Math.min(FRAME, buf.length - i);
    const data = new Float32Array(n * ch);
    for (let c = 0; c < ch; c++) data.set(channels[c].subarray(i, i + n), c * n);
    const sample = new AudioSample({
      data, format: 'f32-planar', numberOfChannels: ch, sampleRate: SAMPLE_RATE, timestamp: (startFrame + i) / SAMPLE_RATE,
    });
    await source.add(sample);
    sample.close();
  }
}

export async function exportProject(req: ExportRequest): Promise<ExportResult> {
  const { project, onProgress } = req;
  const duration = projectDuration(project);
  if (duration <= 0) throw new Error('Nothing to export');
  const base = outputSize(project.aspect, req.shortSide);
  const choice = req.forceMethod
    ? { method: req.forceMethod, ...base, downscaled: false }
    : await chooseMethod(base.width, base.height, req.shortSide);
  onProgress({ stage: 'loading', progress: 0, eta: null });
  await ensureOverlayAssets(project.overlays);

  if (choice.method === 'ffmpeg') {
    const { exportWithFfmpeg } = await import('./ffmpegExport');
    const file = await exportWithFfmpeg(req, choice.width, choice.height);
    return { file, method: 'ffmpeg', width: choice.width, height: choice.height, duration, downscaled: false };
  }
  if (choice.method === 'webcodecs-wasm-aac') {
    const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
    registerAacEncoder();
  }

  const { width, height } = choice;
  const opfs = await openOpfsTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: opfs ? false : 'in-memory' }),
    target: opfs ? new StreamTarget(opfs.writable, { chunked: true }) : new BufferTarget(),
  });
  const { canvas, ctx } = makeCanvas(width, height);
  const videoSource = new CanvasSource(canvas, {
    codec: 'avc',
    bitrate: VIDEO_BITRATE[req.shortSide],
    keyFrameInterval: 2,
    sizeChangeBehavior: 'contain',
  });
  const audioSource = new AudioSampleSource({ codec: 'aac', bitrate: AUDIO_BITRATE });
  output.addVideoTrack(videoSource, { frameRate: FPS });
  output.addAudioTrack(audioSource);

  const readers = await openAudioReaders(project, req.media);
  let audioUntil = 0;
  const pumpAudio = async (t: number) => {
    // Keep audio a little ahead of video so the muxer can interleave without buffering much.
    while (audioUntil < duration && audioUntil < t + 1) {
      const w1 = Math.min(duration, audioUntil + MIX_WINDOW);
      const buf = await mixWindow(project, audioUntil, w1, readers.video, readers.music);
      await addAudioFrames(audioSource, buf, audioUntil);
      audioUntil = w1;
    }
  };

  const started = performance.now();
  try {
    await output.start();
    const total = Math.max(1, Math.round(duration * FPS));
    await renderFrames(req, ctx, width, height, false, async (f, t) => {
      await videoSource.add(t, 1 / FPS, { keyFrame: f === 0 });
      const done = (f + 1) / total;
      const elapsed = (performance.now() - started) / 1000;
      onProgress({ stage: 'rendering', progress: done, eta: done > 0.03 ? (elapsed / done) * (1 - done) : null });
    }, pumpAudio);
    await pumpAudio(duration);
    onProgress({ stage: 'finishing', progress: 1, eta: 0 });
    videoSource.close();
    audioSource.close();
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => null);
    if (opfs) await opfs.writable.close().catch(() => null);
    throw e;
  } finally {
    readers.close();
  }

  const name = exportFileName();
  let file: File;
  if (opfs) {
    const raw = await opfs.handle.getFile();
    file = new File([raw], name, { type: 'video/mp4' });
  } else {
    file = new File([(output.target as BufferTarget).buffer!], name, { type: 'video/mp4' });
  }
  return { file, method: choice.method, width, height, duration, downscaled: choice.downscaled };
}
