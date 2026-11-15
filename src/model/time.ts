import type { AspectRatio, FitMode, MusicClip, Project, VideoClip } from './types';

/** Smallest clip we allow after trimming or splitting, seconds. */
export const MIN_CLIP = 0.1;
export const FPS = 30;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Rounds to whole microseconds so repeated edits do not accumulate float noise. */
export const roundTime = (t: number) => Math.round(t * 1e6) / 1e6;

export const clipDuration = (c: Pick<VideoClip, 'in' | 'out' | 'speed'>) => (c.out - c.in) / (c.speed || 1);

/** Timeline start time of every video clip (clips play back to back). */
export function clipStarts(clips: VideoClip[]): number[] {
  const starts: number[] = [];
  let t = 0;
  for (const c of clips) {
    starts.push(roundTime(t));
    t += clipDuration(c);
  }
  return starts;
}

export const videoTrackDuration = (clips: VideoClip[]) => roundTime(clips.reduce((s, c) => s + clipDuration(c), 0));

export const musicEnd = (m: MusicClip) => m.start + (m.out - m.in);

/**
 * Length of the finished video. The video track decides when it has clips; otherwise overlays and
 * music do, so an overlay-only project still renders (on black).
 */
export function projectDuration(p: Project): number {
  const v = videoTrackDuration(p.clips);
  if (v > 0) return v;
  const ends = [...p.overlays.map((o) => o.start + o.duration), ...p.music.map(musicEnd)];
  return roundTime(Math.max(0, ...ends));
}

export interface ClipLocation {
  index: number;
  clip: VideoClip;
  /** Timeline time where this clip starts. */
  start: number;
  /** Time inside the source media. */
  sourceTime: number;
}

/** Finds the video clip that is on screen at timeline time t (end-exclusive, except at the very end). */
export function locate(clips: VideoClip[], t: number): ClipLocation | null {
  let start = 0;
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const d = clipDuration(c);
    const last = i === clips.length - 1;
    if (t >= start - 1e-9 && (t < start + d - 1e-9 || (last && t <= start + d + 1e-9))) {
      const local = clamp(t - start, 0, d);
      return { index: i, clip: c, start, sourceTime: roundTime(c.in + local * (c.speed || 1)) };
    }
    start += d;
  }
  return null;
}

/** Gains for the "original audio vs music" slider. Centre keeps both at full level. */
export function balanceGains(balance: number): { original: number; music: number } {
  const b = clamp(balance, 0, 1);
  return { original: Math.min(1, 2 * (1 - b)), music: Math.min(1, 2 * b) };
}

/** Fade envelope (0..1) of a music clip at timeline time t. */
export function musicEnvelope(m: MusicClip, t: number): number {
  const len = m.out - m.in;
  const local = t - m.start;
  if (local < 0 || local > len) return 0;
  let g = 1;
  if (m.fadeIn > 0 && local < m.fadeIn) g = Math.min(g, local / m.fadeIn);
  if (m.fadeOut > 0 && local > len - m.fadeOut) g = Math.min(g, (len - local) / m.fadeOut);
  return clamp(g, 0, 1);
}

/** Output frame size. "1080p" means the shorter side is 1080; dimensions are even for H.264. */
export function outputSize(aspect: AspectRatio, shortSide: number): { width: number; height: number } {
  const even = (n: number) => Math.round(n / 2) * 2;
  switch (aspect) {
    case '16:9':
      return { width: even((shortSide * 16) / 9), height: shortSide };
    case '9:16':
      return { width: shortSide, height: even((shortSide * 16) / 9) };
    case '1:1':
      return { width: shortSide, height: shortSide };
  }
}

export const aspectValue = (a: AspectRatio) => (a === '16:9' ? 16 / 9 : a === '9:16' ? 9 / 16 : 1);

/** Where to draw a source of size sw×sh inside a dw×dh frame. */
export function fitRect(sw: number, sh: number, dw: number, dh: number, mode: FitMode) {
  if (sw <= 0 || sh <= 0) return { x: 0, y: 0, w: dw, h: dh };
  const s = mode === 'contain' ? Math.min(dw / sw, dh / sh) : Math.max(dw / sw, dh / sh);
  const w = sw * s;
  const h = sh * s;
  return { x: (dw - w) / 2, y: (dh - h) / 2, w, h };
}

/** 75.25 → "1:15.2" */
export function formatTime(t: number, withTenths = true): string {
  const safe = Math.max(0, t);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const tenths = Math.floor((safe * 10) % 10);
  return `${m}:${String(s).padStart(2, '0')}${withTenths ? '.' + tenths : ''}`;
}

/** Snaps a time to the nearest output frame boundary. */
export const snapToFrame = (t: number, fps = FPS) => Math.round(t * fps) / fps;
