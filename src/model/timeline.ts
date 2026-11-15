// Pure timeline operations. Each returns a new Project (or the same object when nothing changed).
import { clipDuration, clipStarts, locate, MIN_CLIP, roundTime, clamp } from './time';
import type { MediaInfo, MusicClip, Overlay, Project, VideoClip } from './types';

let counter = 0;
export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const DEFAULT_IMAGE_SECONDS = 3;

export function clipFromMedia(m: MediaInfo): VideoClip {
  return {
    id: newId('clip'),
    mediaId: m.id,
    in: 0,
    out: m.kind === 'image' ? DEFAULT_IMAGE_SECONDS : m.duration,
    speed: 1,
    volume: 1,
    muted: false,
    fit: 'contain',
  };
}

export function musicFromMedia(m: MediaInfo, start = 0): MusicClip {
  return { id: newId('music'), mediaId: m.id, start, in: 0, out: m.duration, volume: 1, fadeIn: 0, fadeOut: 0 };
}

export function addClips(p: Project, clips: VideoClip[], at = p.clips.length): Project {
  const next = p.clips.slice();
  next.splice(clamp(at, 0, next.length), 0, ...clips);
  return { ...p, clips: next };
}

export function addMusic(p: Project, m: MusicClip): Project {
  return { ...p, music: [...p.music, m] };
}

export function addOverlay(p: Project, o: Overlay): Project {
  return { ...p, overlays: [...p.overlays, o] };
}

/** Splits the video clip under timeline time t. Returns the project and the id of the new right half. */
export function splitClipAt(p: Project, t: number): { project: Project; newId: string | null } {
  const loc = locate(p.clips, t);
  if (!loc) return { project: p, newId: null };
  const { clip, index, sourceTime } = loc;
  if (sourceTime - clip.in < MIN_CLIP || clip.out - sourceTime < MIN_CLIP) return { project: p, newId: null };
  const left: VideoClip = { ...clip, out: sourceTime };
  const right: VideoClip = { ...clip, id: newId('clip'), in: sourceTime };
  const clips = p.clips.slice();
  clips.splice(index, 1, left, right);
  return { project: { ...p, clips }, newId: right.id };
}

export function splitMusicAt(p: Project, id: string, t: number): { project: Project; newId: string | null } {
  const i = p.music.findIndex((m) => m.id === id);
  if (i < 0) return { project: p, newId: null };
  const m = p.music[i];
  const cut = roundTime(m.in + (t - m.start));
  if (cut - m.in < MIN_CLIP || m.out - cut < MIN_CLIP) return { project: p, newId: null };
  const left: MusicClip = { ...m, out: cut, fadeOut: 0 };
  const right: MusicClip = { ...m, id: newId('music'), in: cut, start: roundTime(t), fadeIn: 0 };
  const music = p.music.slice();
  music.splice(i, 1, left, right);
  return { project: { ...p, music }, newId: right.id };
}

/**
 * Moves one edge of a video clip. `value` is the new source in- or out-point in seconds.
 * `maxOut` is the source length (Infinity for images).
 */
export function trimClip(p: Project, id: string, edge: 'in' | 'out', value: number, maxOut: number): Project {
  const i = p.clips.findIndex((c) => c.id === id);
  if (i < 0) return p;
  const c = p.clips[i];
  const next =
    edge === 'in'
      ? { ...c, in: roundTime(clamp(value, 0, c.out - MIN_CLIP)) }
      : { ...c, out: roundTime(clamp(value, c.in + MIN_CLIP, maxOut)) };
  if (next.in === c.in && next.out === c.out) return p;
  const clips = p.clips.slice();
  clips[i] = next;
  return { ...p, clips };
}

export function trimMusic(p: Project, id: string, edge: 'in' | 'out', value: number, maxOut: number): Project {
  const i = p.music.findIndex((m) => m.id === id);
  if (i < 0) return p;
  const m = p.music[i];
  let next: MusicClip;
  if (edge === 'in') {
    // Dragging the left edge keeps the right edge fixed on the timeline.
    const newIn = roundTime(clamp(value, Math.max(0, m.in - m.start), m.out - MIN_CLIP));
    next = { ...m, in: newIn, start: roundTime(m.start + (newIn - m.in)) };
  } else {
    next = { ...m, out: roundTime(clamp(value, m.in + MIN_CLIP, maxOut)) };
  }
  const len = next.out - next.in;
  next.fadeIn = Math.min(next.fadeIn, len);
  next.fadeOut = Math.min(next.fadeOut, len);
  const music = p.music.slice();
  music[i] = next;
  return { ...p, music };
}

export function moveClip(p: Project, from: number, to: number): Project {
  if (from === to || from < 0 || from >= p.clips.length) return p;
  const clips = p.clips.slice();
  const [c] = clips.splice(from, 1);
  clips.splice(clamp(to, 0, clips.length), 0, c);
  return { ...p, clips };
}

/** Removes a clip, music clip or overlay by id. */
export function removeItem(p: Project, id: string): Project {
  if (p.clips.some((c) => c.id === id)) return { ...p, clips: p.clips.filter((c) => c.id !== id) };
  if (p.music.some((m) => m.id === id)) return { ...p, music: p.music.filter((m) => m.id !== id) };
  if (p.overlays.some((o) => o.id === id)) return { ...p, overlays: p.overlays.filter((o) => o.id !== id) };
  return p;
}

function patchIn<T extends { id: string }>(list: T[], id: string, patch: Partial<T>): T[] | null {
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const next = list.slice();
  next[i] = { ...list[i], ...patch, id };
  return next;
}

export const updateClip = (p: Project, id: string, patch: Partial<VideoClip>): Project => {
  const clips = patchIn(p.clips, id, patch);
  return clips ? { ...p, clips } : p;
};

export const updateMusic = (p: Project, id: string, patch: Partial<MusicClip>): Project => {
  const music = patchIn(p.music, id, patch);
  return music ? { ...p, music } : p;
};

export const updateOverlay = (p: Project, id: string, patch: Partial<Overlay>): Project => {
  const overlays = patchIn(p.overlays as Overlay[], id, patch as Partial<Overlay>);
  return overlays ? { ...p, overlays } : p;
};

/** Index the dragged clip would land at, given the pointer's timeline time. */
export function dropIndex(clips: VideoClip[], from: number, t: number): number {
  const starts = clipStarts(clips);
  let to = 0;
  for (let i = 0; i < clips.length; i++) {
    if (i === from) continue;
    const mid = starts[i] + clipDuration(clips[i]) / 2;
    if (t > mid) to++;
  }
  return to;
}

/** Media ids still referenced by the project (to clean up unused blobs). */
export function referencedMedia(p: Project): Set<string> {
  return new Set([...p.clips.map((c) => c.mediaId), ...p.music.map((m) => m.mediaId)]);
}
