// Works out what an imported file is and whether this device can decode it.
// WebCodecs (via Mediabunny) is tried first; the browser's own <video>/<audio> elements are the fallback.
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import type { MediaInfo } from '../model/types';
import { newId } from '../model/timeline';
import { t } from '../i18n/strings';

export class UnsupportedMediaError extends Error {}

const CODEC_NAMES: Record<string, string> = {
  avc: 'H.264', hevc: 'HEVC (H.265)', vp8: 'VP8', vp9: 'VP9', av1: 'AV1', aac: 'AAC', mp3: 'MP3', opus: 'Opus',
};
const codecName = (c: string | null | undefined) => (c ? (CODEC_NAMES[c] ?? c.toUpperCase()) : t('import.unknownCodec'));

export interface ProbeResult {
  info: MediaInfo;
  /** True when WebCodecs can decode the video (fast export); false when only the <video> element can. */
  webcodecs: boolean;
}

function kindOf(file: File): MediaInfo['kind'] | null {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'mov', 'm4v', 'webm', 'mkv', '3gp'].includes(ext)) return 'video';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif'].includes(ext)) return 'image';
  if (['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'flac', 'opus'].includes(ext)) return 'audio';
  return null;
}

export async function probeFile(file: File, forceKind?: MediaInfo['kind']): Promise<ProbeResult> {
  const kind = forceKind ?? kindOf(file);
  if (!kind) throw new UnsupportedMediaError(t('import.unknownType', { name: file.name }));
  const base = { id: newId('media'), name: file.name, kind, mime: file.type, size: file.size };
  if (kind === 'image') {
    const { width, height } = await imageSize(file);
    return { info: { ...base, duration: 0, width, height, hasAudio: false }, webcodecs: false };
  }
  if (kind === 'audio') return probeAudio(file, base);
  return probeVideo(file, base);
}

type Base = Pick<MediaInfo, 'id' | 'name' | 'kind' | 'mime' | 'size'>;

async function probeVideo(file: File, base: Base): Promise<ProbeResult> {
  let codec: string | null = null;
  try {
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) {
      // A "video" with no picture: treat it as audio (e.g. voice memos saved as .mp4/.m4a).
      if (await input.getPrimaryAudioTrack()) return probeAudio(file, { ...base, kind: 'audio' });
      throw new UnsupportedMediaError(t('import.noVideoTrack', { name: file.name }));
    }
    codec = track.codec;
    const audio = await input.getPrimaryAudioTrack();
    const duration = await input.computeDuration();
    if (typeof VideoDecoder !== 'undefined' && (await track.canDecode())) {
      return {
        info: {
          ...base, duration, width: track.displayWidth, height: track.displayHeight,
          hasAudio: !!audio && (await audio.canDecode().catch(() => false)),
        },
        webcodecs: true,
      };
    }
    } finally {
      input.dispose();
    }
  } catch (e) {
    if (e instanceof UnsupportedMediaError) throw e;
    // Container not understood by Mediabunny; let the browser have a go below.
  }
  const el = await elementProbe(file, 'video');
  if (el && el.width > 0) {
    return { info: { ...base, duration: el.duration, width: el.width, height: el.height, hasAudio: true }, webcodecs: false };
  }
  throw new UnsupportedMediaError(t('import.unsupportedCodec', { name: file.name, codec: codecName(codec) }));
}

async function probeAudio(file: File, base: Base): Promise<ProbeResult> {
  let codec: string | null = null;
  try {
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryAudioTrack();
      codec = track?.codec ?? null;
      if (track && typeof AudioDecoder !== 'undefined' && (await track.canDecode())) {
        const duration = await input.computeDuration();
        return { info: { ...base, kind: 'audio', duration, width: 0, height: 0, hasAudio: true }, webcodecs: true };
      }
    } finally {
      input.dispose();
    }
  } catch {
    /* fall through */
  }
  const el = await elementProbe(file, 'audio');
  if (el) return { info: { ...base, kind: 'audio', duration: el.duration, width: 0, height: 0, hasAudio: true }, webcodecs: false };
  throw new UnsupportedMediaError(t('import.unsupportedCodec', { name: file.name, codec: codecName(codec) }));
}

/** Loads the file into a media element and checks it can at least read metadata and the first frame. */
function elementProbe(file: File, tag: 'video' | 'audio'): Promise<{ duration: number; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const el = document.createElement(tag);
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (r: { duration: number; width: number; height: number } | null) => {
      if (done) return;
      done = true;
      el.removeAttribute('src');
      el.load();
      URL.revokeObjectURL(url);
      resolve(r);
    };
    el.preload = 'auto';
    el.muted = true;
    if (el instanceof HTMLVideoElement) el.playsInline = true;
    el.onerror = () => finish(null);
    el.onloadeddata = () => {
      const v = el as HTMLVideoElement;
      if (!Number.isFinite(el.duration)) return finish(null);
      finish({ duration: el.duration, width: v.videoWidth ?? 0, height: v.videoHeight ?? 0 });
    };
    setTimeout(() => finish(null), 15000);
    el.src = url;
  });
}

async function imageSize(file: Blob): Promise<{ width: number; height: number }> {
  try {
    const bmp = await createImageBitmap(file);
    const r = { width: bmp.width, height: bmp.height };
    bmp.close();
    return r;
  } catch {
    // Some formats (HEIC on iOS) decode in <img> but not createImageBitmap.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { width: img.naturalWidth, height: img.naturalHeight };
    } catch {
      throw new UnsupportedMediaError(t('import.unsupportedImage', { name: (file as File).name ?? '' }));
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Mobile devices get a warning before big imports (iOS kills tabs that use too much memory). */
export function isMobileDevice() {
  return matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 1100;
}

export const BIG_FILE_BYTES = 1024 ** 3;
export const LONG_CLIP_SECONDS = 600;
