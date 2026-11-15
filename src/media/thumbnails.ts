// Small JPEG thumbnails for timeline clips, generated once per media file and kept as object URLs.
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import type { MediaInfo } from '../model/types';
import { blobFor, urlFor } from './library';

export interface Thumb {
  time: number;
  url: string;
}

const THUMB_H = 72;
const cache = new Map<string, Promise<Thumb[]>>();

export function thumbnailsFor(m: MediaInfo): Promise<Thumb[]> {
  let p = cache.get(m.id);
  if (!p) {
    p = (m.kind === 'image' ? imageThumb(m) : videoThumbs(m)).catch(() => []);
    cache.set(m.id, p);
  }
  return p;
}

export function dropThumbnails(id: string) {
  const p = cache.get(id);
  cache.delete(id);
  void p?.then((list) => list.forEach((t) => URL.revokeObjectURL(t.url)));
}

const count = (duration: number) => Math.max(1, Math.min(40, Math.ceil(duration / 2)));
const times = (duration: number) => {
  const n = count(duration);
  return Array.from({ length: n }, (_, i) => (duration * (i + 0.5)) / n);
};

function toBlobUrl(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<string> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 }).then((b) => URL.createObjectURL(b));
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(URL.createObjectURL(b)) : reject(new Error('thumb'))), 'image/jpeg', 0.7));
}

async function imageThumb(m: MediaInfo): Promise<Thumb[]> {
  const bmp = await createImageBitmap(await blobFor(m), { resizeHeight: THUMB_H, resizeQuality: 'medium' });
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  bmp.close();
  return [{ time: 0, url: await toBlobUrl(c) }];
}

async function videoThumbs(m: MediaInfo): Promise<Thumb[]> {
  const width = Math.max(2, Math.round((THUMB_H * (m.width || 16)) / (m.height || 9)));
  if (typeof VideoDecoder !== 'undefined') {
    const input = new Input({ source: new BlobSource(await blobFor(m)), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (track && (await track.canDecode())) {
        const sink = new CanvasSink(track, { width, height: THUMB_H, fit: 'cover', poolSize: 1 });
        const out: Thumb[] = [];
        const ts = times(m.duration);
        let i = 0;
        for await (const wrapped of sink.canvasesAtTimestamps(ts)) {
          if (wrapped) out.push({ time: ts[i], url: await toBlobUrl(wrapped.canvas) });
          i++;
        }
        if (out.length) return out;
      }
    } finally {
      input.dispose();
    }
  }
  return elementThumbs(m, width);
}

/** Fallback without WebCodecs: seek a <video> element. Fewer thumbnails, since seeking is slow. */
async function elementThumbs(m: MediaInfo, width: number): Promise<Thumb[]> {
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = await urlFor(m);
  await new Promise<void>((res, rej) => {
    v.onloadeddata = () => res();
    v.onerror = () => rej(new Error('thumb'));
  });
  const c = document.createElement('canvas');
  c.width = width;
  c.height = THUMB_H;
  const ctx = c.getContext('2d')!;
  const out: Thumb[] = [];
  const ts = times(m.duration).filter((_, i, a) => a.length <= 8 || i % Math.ceil(a.length / 8) === 0);
  for (const t of ts) {
    await new Promise<void>((res) => {
      v.onseeked = () => res();
      v.currentTime = t;
      setTimeout(res, 3000);
    });
    ctx.drawImage(v, 0, 0, width, THUMB_H);
    out.push({ time: t, url: await toBlobUrl(c) });
  }
  v.removeAttribute('src');
  v.load();
  return out;
}
