// Frame and audio readers used by the exporter. Each has a WebCodecs (Mediabunny) implementation and a
// fallback built on the browser's media elements / decodeAudioData for devices without WebCodecs.
import { ALL_FORMATS, AudioSampleSink, BlobSource, Input, VideoSampleSink, type VideoSample } from 'mediabunny';
import type { MediaInfo } from '../model/types';
import { blobFor, urlFor } from '../media/library';
import { loadImage } from '../media/images';
import type { VisualSource } from '../render/compose';

export interface FrameReader {
  /** Yields one visual per requested source time, in order. A yielded source is valid until the next one. */
  frames(times: number[], signal: AbortSignal): AsyncGenerator<VisualSource | null>;
  close(): void;
}

export interface AudioChunk {
  /** Source time of the first sample. */
  time: number;
  buffer: AudioBuffer;
}

export interface AudioReader {
  read(from: number, to: number): AsyncGenerator<AudioChunk>;
  close(): void;
}

const canUseWebCodecsVideo = () => typeof VideoDecoder !== 'undefined';
const canUseWebCodecsAudio = () => typeof AudioDecoder !== 'undefined';

// ---------- video ----------

class MediabunnyFrameReader implements FrameReader {
  constructor(private input: Input, private sink: VideoSampleSink) {}

  async *frames(times: number[], signal: AbortSignal) {
    let held: VideoSample | null = null;
    try {
      for await (const sample of this.sink.samplesAtTimestamps(times)) {
        if (signal.aborted) break;
        if (sample) {
          held?.close();
          held = sample;
        }
        // Before the first decodable frame, keep showing whatever we have (or black).
        const s = held;
        yield s ? ({ width: s.displayWidth, height: s.displayHeight, draw: (c, x, y, w, h) => s.draw(c, x, y, w, h) } as VisualSource) : null;
      }
    } finally {
      held?.close();
    }
  }

  close() {
    this.input.dispose();
  }
}

class ElementFrameReader implements FrameReader {
  private v: HTMLVideoElement;
  constructor(v: HTMLVideoElement) {
    this.v = v;
  }

  static async create(m: MediaInfo) {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = await urlFor(m);
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res();
      v.onerror = () => rej(new Error(`Cannot read ${m.name}`));
    });
    return new ElementFrameReader(v);
  }

  async *frames(times: number[], signal: AbortSignal) {
    const v = this.v;
    const src: VisualSource = { width: v.videoWidth, height: v.videoHeight, draw: (c, x, y, w, h) => c.drawImage(v, x, y, w, h) };
    for (const t of times) {
      if (signal.aborted) return;
      if (Math.abs(v.currentTime - t) > 1e-3) {
        await new Promise<void>((res) => {
          const done = () => res();
          v.addEventListener('seeked', done, { once: true });
          v.currentTime = t;
          setTimeout(done, 4000);
        });
        // Wait until the new frame has actually been presented, where the browser can tell us.
        if ('requestVideoFrameCallback' in v) {
          await new Promise<void>((res) => {
            (v as HTMLVideoElement & { requestVideoFrameCallback(cb: () => void): number }).requestVideoFrameCallback(() => res());
            setTimeout(res, 120);
          });
        }
      }
      yield src;
    }
  }

  close() {
    this.v.removeAttribute('src');
    this.v.load();
  }
}

class ImageFrameReader implements FrameReader {
  constructor(private img: ImageBitmap | HTMLImageElement) {}
  async *frames(times: number[]) {
    const img = this.img;
    const w = 'naturalWidth' in img ? img.naturalWidth : img.width;
    const h = 'naturalHeight' in img ? img.naturalHeight : img.height;
    const src: VisualSource = { width: w, height: h, draw: (c, x, y, dw, dh) => c.drawImage(img, x, y, dw, dh) };
    for (let i = 0; i < times.length; i++) yield src;
  }
  close() {
    if ('close' in this.img) this.img.close();
  }
}

export async function openFrameReader(m: MediaInfo, preferElement = false): Promise<FrameReader> {
  if (m.kind === 'image') return new ImageFrameReader(await loadImage(m));
  if (!preferElement && canUseWebCodecsVideo()) {
    const input = new Input({ source: new BlobSource(await blobFor(m)), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (track && (await track.canDecode())) return new MediabunnyFrameReader(input, new VideoSampleSink(track));
    input.dispose();
  }
  return ElementFrameReader.create(m);
}

// ---------- audio ----------

class MediabunnyAudioReader implements AudioReader {
  constructor(private input: Input, private sink: AudioSampleSink) {}
  async *read(from: number, to: number) {
    for await (const s of this.sink.samples(from, to)) {
      try {
        yield { time: s.timestamp, buffer: s.toAudioBuffer() };
      } finally {
        s.close();
      }
    }
  }
  close() {
    this.input.dispose();
  }
}

/** Fallback: decode the whole file with Web Audio. Uses more memory, so only used without WebCodecs. */
class DecodedAudioReader implements AudioReader {
  constructor(private buffer: AudioBuffer) {}
  async *read() {
    yield { time: 0, buffer: this.buffer };
  }
  close() {}
}

const silentReader: AudioReader = { async *read() {}, close() {} };

export async function openAudioReader(m: MediaInfo, ctxForDecode: BaseAudioContext): Promise<AudioReader> {
  if (!m.hasAudio || m.kind === 'image') return silentReader;
  const blob = await blobFor(m);
  if (canUseWebCodecsAudio()) {
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryAudioTrack();
      if (track && (await track.canDecode())) return new MediabunnyAudioReader(input, new AudioSampleSink(track));
    } catch {
      /* fall through */
    }
    input.dispose();
  }
  try {
    return new DecodedAudioReader(await ctxForDecode.decodeAudioData(await blob.arrayBuffer()));
  } catch {
    return silentReader;
  }
}
