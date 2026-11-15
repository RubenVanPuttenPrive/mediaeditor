// The project is plain JSON: it is autosaved, undone/redone as snapshots, and (later) saved as a file.

export type AspectRatio = '16:9' | '9:16' | '1:1';
export type FitMode = 'contain' | 'cover';

export interface MediaInfo {
  id: string;
  name: string;
  kind: 'video' | 'image' | 'audio';
  mime: string;
  size: number;
  /** Seconds. Images get 0 (their length lives on the clip). */
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  /** Set for music shipped with the app; the blob is fetched from this URL instead of IndexedDB. */
  builtinUrl?: string;
}

export interface VideoClip {
  id: string;
  mediaId: string;
  /** Source in/out points in seconds. For images, in = 0 and out = display length. */
  in: number;
  out: number;
  /** Reserved for the later speed feature; always 1 for now. */
  speed: number;
  /** Linear gain for the clip's own sound, 0..2. */
  volume: number;
  muted: boolean;
  fit: FitMode;
}

export interface MusicClip {
  id: string;
  mediaId: string;
  /** Position on the timeline, seconds. */
  start: number;
  in: number;
  out: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

interface OverlayBase {
  id: string;
  start: number;
  duration: number;
  /** Centre position as a fraction of the frame (0..1). */
  x: number;
  y: number;
  /** Size relative to the frame's shorter side (1 = full). */
  scale: number;
  /** Radians. */
  rotation: number;
}

export interface EmojiOverlay extends OverlayBase {
  kind: 'emoji';
  /** Twemoji file name without extension, e.g. "1f600". */
  file: string;
  label: string;
}

export interface StickerOverlay extends OverlayBase {
  kind: 'sticker';
  sticker: string;
}

export interface TextOverlay extends OverlayBase {
  kind: 'text';
  text: string;
  font: string;
  color: string;
  outline: boolean;
  shadow: boolean;
}

export type Overlay = EmojiOverlay | StickerOverlay | TextOverlay;

export interface Project {
  version: 1;
  aspect: AspectRatio;
  /** 0 = only original sound, 1 = only music, 0.5 = both at full level. */
  balance: number;
  clips: VideoClip[];
  music: MusicClip[];
  overlays: Overlay[];
}

export const emptyProject = (): Project => ({
  version: 1,
  aspect: '16:9',
  balance: 0.5,
  clips: [],
  music: [],
  overlays: [],
});
