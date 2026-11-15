// Music bundled with the app. Synthesised for MediaEditor by scripts/make-music.py; public domain (CC0 1.0).
import type { MediaInfo } from '../model/types';
import { ASSET_BASE } from './assets';
import type { StringKey } from '../i18n/strings';

export interface BuiltinTrack {
  id: string;
  title: string;
  /** Short style description, from the strings file. */
  style: StringKey;
  duration: number;
  license: string;
}

export const BUILTIN_TRACKS: BuiltinTrack[] = [
  { id: 'sunny-loop', title: 'Sunny Loop', style: 'music.style.pop', duration: 71.5, license: 'CC0 1.0' },
  { id: 'tropical-sunset', title: 'Tropical Sunset', style: 'music.style.tropical', duration: 69.6, license: 'CC0 1.0' },
  { id: 'funky-groove', title: 'Funky Groove', style: 'music.style.funk', duration: 72.2, license: 'CC0 1.0' },
  { id: 'rock-drive', title: 'Rock Drive', style: 'music.style.rock', duration: 66.7, license: 'CC0 1.0' },
  { id: 'retro-arcade', title: 'Retro Arcade', style: 'music.style.chiptune', duration: 64.7, license: 'CC0 1.0' },
  { id: 'night-drive', title: 'Night Drive', style: 'music.style.synthwave', duration: 73, license: 'CC0 1.0' },
  { id: 'lofi-steps', title: 'Lo-fi Steps', style: 'music.style.lofi', duration: 69, license: 'CC0 1.0' },
  { id: 'acoustic-morning', title: 'Acoustic Morning', style: 'music.style.acoustic', duration: 65.4, license: 'CC0 1.0' },
  { id: 'piano-reflections', title: 'Piano Reflections', style: 'music.style.piano', duration: 70.6, license: 'CC0 1.0' },
  { id: 'cinematic-rise', title: 'Cinematic Rise', style: 'music.style.cinematic', duration: 65.7, license: 'CC0 1.0' },
];

export const trackUrl = (id: string) => `${ASSET_BASE}music/${id}.mp3`;

export function builtinMedia(tr: BuiltinTrack, duration: number): MediaInfo {
  return {
    id: `builtin_${tr.id}`, name: tr.title, kind: 'audio', mime: 'audio/mpeg', size: 0,
    duration, width: 0, height: 0, hasAudio: true, builtinUrl: trackUrl(tr.id),
  };
}
