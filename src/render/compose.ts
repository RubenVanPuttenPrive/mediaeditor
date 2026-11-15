// Draws one frame of the project: background, the current video clip, then overlays in order.
// Preview and export share this so what you see is what you get.
import { fitRect } from '../model/time';
import type { FitMode, Overlay, TextOverlay } from '../model/types';
import { fontCss, overlayRaster, stickerAspect } from './assets';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface VisualSource {
  width: number;
  height: number;
  /** Draws the image into the given rectangle (sources apply their own rotation metadata). */
  draw(ctx: Ctx2D, x: number, y: number, w: number, h: number): void;
}

export const BACKGROUND = '#000000';

export function drawBase(ctx: Ctx2D, W: number, H: number, src: VisualSource | null, fit: FitMode) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, W, H);
  if (src && src.width > 0) {
    const r = fitRect(src.width, src.height, W, H, fit);
    ctx.imageSmoothingQuality = 'high';
    src.draw(ctx, r.x, r.y, r.w, r.h);
  }
  ctx.restore();
}

export const isOverlayVisible = (o: Overlay, t: number) => t >= o.start - 1e-6 && t < o.start + o.duration - 1e-6;

const TEXT_SCALE = 0.32;
const LINE_HEIGHT = 1.15;

/** Size and centre of an overlay in frame pixels (before rotation). */
export function overlayBox(o: Overlay, W: number, H: number, ctx?: Ctx2D | null) {
  const base = Math.min(W, H) * o.scale;
  const cx = o.x * W;
  const cy = o.y * H;
  if (o.kind === 'emoji') return { cx, cy, w: base, h: base };
  if (o.kind === 'sticker') {
    const a = stickerAspect(o.sticker);
    return a >= 1 ? { cx, cy, w: base, h: base / a } : { cx, cy, w: base * a, h: base };
  }
  const size = base * TEXT_SCALE;
  const lines = (o.text || ' ').split('\n');
  let w = 0;
  if (ctx) {
    ctx.save();
    ctx.font = fontCss(o.font, size);
    for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
    ctx.restore();
  } else {
    w = Math.max(...lines.map((l) => l.length)) * size * 0.55;
  }
  const pad = size * 0.2;
  return { cx, cy, w: w + pad * 2, h: lines.length * size * LINE_HEIGHT + pad * 2 };
}

function luminance(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function drawText(ctx: Ctx2D, o: TextOverlay, W: number, H: number) {
  const size = Math.min(W, H) * o.scale * TEXT_SCALE;
  const lines = (o.text || '').split('\n');
  ctx.font = fontCss(o.font, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const total = lines.length * size * LINE_HEIGHT;
  const contrast = luminance(o.color) > 0.5 ? '#000000' : '#ffffff';
  lines.forEach((line, i) => {
    const y = -total / 2 + size * LINE_HEIGHT * (i + 0.5);
    if (o.shadow) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = size * 0.18;
      ctx.shadowOffsetY = size * 0.06;
      ctx.fillStyle = o.color;
      ctx.fillText(line, 0, y);
      ctx.restore();
    }
    if (o.outline) {
      ctx.strokeStyle = contrast;
      ctx.lineWidth = size * 0.14;
      ctx.strokeText(line, 0, y);
    }
    ctx.fillStyle = o.color;
    ctx.fillText(line, 0, y);
  });
}

export function drawOverlays(ctx: Ctx2D, W: number, H: number, overlays: Overlay[], t: number) {
  for (const o of overlays) {
    if (!isOverlayVisible(o, t)) continue;
    const box = overlayBox(o, W, H, ctx);
    ctx.save();
    ctx.translate(box.cx, box.cy);
    ctx.rotate(o.rotation);
    if (o.kind === 'text') {
      drawText(ctx, o, W, H);
    } else {
      const img = overlayRaster(o);
      if (img) ctx.drawImage(img, -box.w / 2, -box.h / 2, box.w, box.h);
    }
    ctx.restore();
  }
}

/** Topmost overlay under point (px, py) in frame pixels, or null. */
export function hitOverlay(overlays: Overlay[], t: number, px: number, py: number, W: number, H: number, ctx?: Ctx2D | null) {
  for (let i = overlays.length - 1; i >= 0; i--) {
    const o = overlays[i];
    if (!isOverlayVisible(o, t)) continue;
    const b = overlayBox(o, W, H, ctx);
    const dx = px - b.cx;
    const dy = py - b.cy;
    const c = Math.cos(-o.rotation);
    const s = Math.sin(-o.rotation);
    const lx = dx * c - dy * s;
    const ly = dx * s + dy * c;
    const slack = 8;
    if (Math.abs(lx) <= b.w / 2 + slack && Math.abs(ly) <= b.h / 2 + slack) return o;
  }
  return null;
}
