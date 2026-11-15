// Music bundled with the app. Synthesised for MediaEditor by scripts/make-music.py; public domain (CC0 1.0).
import type { MediaInfo } from '../model/types';
import { ASSET_BASE } from './assets';

export interface BuiltinTrack {
  id: string;
  title: string;
  duration: number;
  license: string;
}

export const BUILTIN_TRACKS: BuiltinTrack[] = [
  { id: 'sunny-loop', title: 'Sunny Loop', duration: 71.5, license: 'CC0 1.0' },
  { id: 'night-drive', title: 'Night Drive', duration: 73, license: 'CC0 1.0' },
  { id: 'lofi-steps', title: 'Lo-fi Steps', duration: 69, license: 'CC0 1.0' },
  { id: 'acoustic-morning', title: 'Acoustic Morning', duration: 65.4, license: 'CC0 1.0' },
];

export const trackUrl = (id: string) => `${ASSET_BASE}music/${id}.mp3`;

export function builtinMedia(tr: BuiltinTrack, duration: number): MediaInfo {
  return {
    id: `builtin_${tr.id}`, name: tr.title, kind: 'audio', mime: 'audio/mpeg', size: 0,
    duration, width: 0, height: 0, hasAudio: true, builtinUrl: trackUrl(tr.id),
  };
}
