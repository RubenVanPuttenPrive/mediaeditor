// Overlay graphics. Emoji come from Twemoji SVGs (not system fonts) so the exported video looks the
// same on every device. Every SVG is rasterised once to a bitmap so drawing is cheap and identical in
// preview and export.
import type { Overlay } from '../model/types';
import { STICKERS, type StickerCaption } from './stickers';

export const ASSET_BASE = import.meta.env.BASE_URL;
const RASTER = 640;

export const emojiUrl = (file: string) => `${ASSET_BASE}emoji/svg/${file}.svg`;
export const stickerUrl = (file: string) => `${ASSET_BASE}stickers/${file}.svg`;

type Raster = HTMLCanvasElement | ImageBitmap;
const rasters = new Map<string, Raster>();
const pending = new Map<string, Promise<Raster | null>>();

export const FONTS = [
  { id: 'Inter', label: 'Inter', weight: 800 },
  { id: 'Bebas Neue', label: 'Bebas Neue', weight: 400 },
  { id: 'Pacifico', label: 'Pacifico', weight: 400 },
  { id: 'Permanent Marker', label: 'Permanent Marker', weight: 400 },
  { id: 'Roboto Slab', label: 'Roboto Slab', weight: 700 },
] as const;

export const fontWeight = (font: string) => FONTS.find((f) => f.id === font)?.weight ?? 700;
export const fontCss = (font: string, px: number) => `${fontWeight(font)} ${px}px "${font}", system-ui, sans-serif`;

async function rasterize(url: string, aspect: number, caption?: StickerCaption): Promise<Raster | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  let svg = await res.text();
  const w = aspect >= 1 ? RASTER : Math.round(RASTER * aspect);
  const h = aspect >= 1 ? Math.round(RASTER / aspect) : RASTER;
  // Give the SVG an explicit size: Safari and Firefox refuse to draw SVGs without intrinsic dimensions.
  svg = svg.replace(/<svg\b([^>]*)>/, (_m, attrs: string) => {
    const cleaned = attrs.replace(/\s(width|height)="[^"]*"/g, '');
    return `<svg${cleaned} width="${w}" height="${h}">`;
  });
  const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image(w, h);
    img.src = blobUrl;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, w, h);
    if (caption) {
      const px = Math.round(caption.size * h);
      const font = `${caption.weight} ${px}px "${caption.font}", system-ui, sans-serif`;
      await document.fonts?.load?.(font, caption.text).catch(() => null);
      ctx.translate(caption.x * w, caption.y * h);
      ctx.rotate(caption.rotate ?? 0);
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (caption.stroke) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = px * 0.12;
        ctx.strokeStyle = caption.stroke;
        ctx.strokeText(caption.text, 0, 0);
      }
      ctx.fillStyle = caption.color;
      ctx.fillText(caption.text, 0, 0);
    }
    return c;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

const keyOf = (o: Overlay) => (o.kind === 'emoji' ? `e:${o.file}` : o.kind === 'sticker' ? `s:${o.sticker}` : null);

export function overlayRaster(o: Overlay): Raster | null {
  const k = keyOf(o);
  return k ? (rasters.get(k) ?? null) : null;
}

export function stickerAspect(id: string) {
  return STICKERS.find((s) => s.id === id)?.aspect ?? 1;
}

/** Loads every graphic and font the overlays need. Resolves when all are ready (failures are skipped). */
export async function ensureOverlayAssets(overlays: Overlay[]): Promise<void> {
  const jobs: Promise<unknown>[] = [];
  for (const o of overlays) {
    if (o.kind === 'text') {
      if (document.fonts?.load) jobs.push(document.fonts.load(fontCss(o.font, 48), o.text || 'A').catch(() => null));
      continue;
    }
    const k = keyOf(o)!;
    if (rasters.has(k)) continue;
    let p = pending.get(k);
    if (!p) {
      p = (o.kind === 'emoji' ? rasterize(emojiUrl(o.file), 1) : rasterize(stickerUrl(o.sticker), stickerAspect(o.sticker), STICKERS.find((d) => d.id === o.sticker)?.caption))
        .catch(() => null)
        .then((r) => {
          if (r) rasters.set(k, r);
          pending.delete(k);
          return r;
        });
      pending.set(k, p);
    }
    jobs.push(p);
  }
  await Promise.all(jobs);
}
