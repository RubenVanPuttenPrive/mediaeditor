// The sticker pack: drawn for MediaEditor and released as CC0. Captions are drawn with bundled fonts
// (not inside the SVG) so they render identically everywhere.
import type { StringKey } from '../i18n/strings';

export interface StickerCaption {
  text: string;
  font: string;
  weight: number;
  color: string;
  stroke?: string;
  /** Centre and size as fractions of the sticker's width/height. */
  x: number;
  y: number;
  size: number;
  rotate?: number;
}

export type StickerCategory = 'faces' | 'hats' | 'reactions' | 'fun';

export interface StickerDef {
  id: string;
  category: StickerCategory;
  /** Display name, from the strings file (key `sticker.<id>`). */
  nameKey: StringKey;
  /** width / height, matching the SVG's viewBox */
  aspect: number;
  caption?: StickerCaption;
}

export const STICKER_CATEGORIES: { id: StickerCategory; labelKey: StringKey; icon: string }[] = [
  { id: 'faces', labelKey: 'stickers.cat.faces', icon: 'googlyeyes' },
  { id: 'hats', labelKey: 'stickers.cat.hats', icon: 'crown' },
  { id: 'reactions', labelKey: 'stickers.cat.reactions', icon: 'boom' },
  { id: 'fun', labelKey: 'stickers.cat.fun', icon: 'duck' },
];

const BEBAS = { font: 'Bebas Neue', weight: 400 };
const MARKER = { font: 'Permanent Marker', weight: 400 };
const SCRIPT = { font: 'Pacifico', weight: 400 };

const s = (id: string, category: StickerCategory, w: number, h: number, caption?: StickerCaption): StickerDef =>
  ({ id, category, nameKey: `sticker.${id}` as StringKey, aspect: w / h, caption });

export const STICKERS: StickerDef[] = [
  // Faces: things to put on a face
  s('googlyeyes', 'faces', 400, 200),
  s('sunglasses', 'faces', 400, 170),
  s('heartshades', 'faces', 400, 170),
  s('pixelshades', 'faces', 400, 110),
  s('groucho', 'faces', 400, 300),
  s('mustache', 'faces', 400, 160),
  s('beard', 'faces', 360, 300),
  s('clownnose', 'faces', 200, 200),
  s('kiss', 'faces', 300, 200),
  s('tongue', 'faces', 300, 240),

  // Hats and headwear
  s('crown', 'hats', 400, 280),
  s('party', 'hats', 260, 320),
  s('tophat', 'hats', 320, 300),
  s('cowboyhat', 'hats', 400, 230),
  s('chefhat', 'hats', 320, 300),
  s('viking', 'hats', 420, 300),
  s('bunnyears', 'hats', 400, 320),
  s('catears', 'hats', 400, 220),
  s('devilhorns', 'hats', 400, 200),
  s('halo', 'hats', 400, 140),
  s('bowtie', 'hats', 320, 170),

  // Reactions: comic captions
  s('wow', 'reactions', 400, 300, { text: 'WOW', ...BEBAS, color: '#ff3864', stroke: '#1b1b1b', x: 0.5, y: 0.53, size: 0.4, rotate: -0.1 }),
  s('omg', 'reactions', 400, 300, { text: 'OMG!', ...BEBAS, color: '#ff3864', x: 0.5, y: 0.43, size: 0.42, rotate: -0.05 }),
  s('lol', 'reactions', 400, 300, { text: 'LOL', ...BEBAS, color: '#7b5cff', x: 0.5, y: 0.42, size: 0.46 }),
  s('boom', 'reactions', 420, 320, { text: 'BOOM!', ...BEBAS, color: '#ffffff', stroke: '#1b1b1b', x: 0.5, y: 0.53, size: 0.3, rotate: -0.08 }),
  s('pow', 'reactions', 400, 300, { text: 'POW!', ...BEBAS, color: '#ffd23f', stroke: '#1b1b1b', x: 0.5, y: 0.52, size: 0.34, rotate: 0.1 }),
  s('what', 'reactions', 300, 300, { text: '?!', ...MARKER, color: '#ffffff', stroke: '#1b1b1b', x: 0.5, y: 0.42, size: 0.42 }),
  s('hmm', 'reactions', 400, 300, { text: 'Hmm…', ...SCRIPT, color: '#1b1b1b', x: 0.53, y: 0.36, size: 0.22 }),
  s('zzz', 'reactions', 360, 260, { text: 'Zzz', ...MARKER, color: '#4ea8ff', stroke: '#1b1b1b', x: 0.55, y: 0.52, size: 0.34, rotate: -0.12 }),
  s('yay', 'reactions', 420, 260, { text: 'YAY!', ...BEBAS, color: '#ffffff', x: 0.5, y: 0.55, size: 0.38 }),
  s('oops', 'reactions', 400, 260, { text: 'OOPS!', ...MARKER, color: '#1b1b1b', x: 0.5, y: 0.45, size: 0.3, rotate: -0.1 }),
  s('nope', 'reactions', 300, 300, { text: 'NOPE', ...BEBAS, color: '#ffffff', x: 0.5, y: 0.52, size: 0.3 }),
  s('epic', 'reactions', 440, 220, { text: 'EPIC', ...BEBAS, color: '#8a5a00', x: 0.5, y: 0.45, size: 0.38 }),
  s('hundred', 'reactions', 360, 240, { text: '100', ...MARKER, color: '#e8273f', stroke: '#1b1b1b', x: 0.5, y: 0.42, size: 0.62, rotate: -0.06 }),
  s('theend', 'reactions', 480, 180, { text: 'The End', ...SCRIPT, color: '#ffffff', x: 0.5, y: 0.42, size: 0.36 }),

  // Fun stuff
  s('heart', 'fun', 300, 280),
  s('star', 'fun', 300, 290),
  s('sparkles', 'fun', 300, 300),
  s('fire', 'fun', 240, 300),
  s('rainbow', 'fun', 400, 240),
  s('confetti', 'fun', 400, 300),
  s('ghost', 'fun', 260, 300),
  s('duck', 'fun', 320, 280),
  s('banana', 'fun', 320, 260),
  s('pizza', 'fun', 300, 300),
  s('sweat', 'fun', 180, 260),
  s('anger', 'fun', 240, 240),
  s('arrow', 'fun', 400, 200),
];
