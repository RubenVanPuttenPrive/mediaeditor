// The sticker pack: drawn for MediaEditor and released as CC0. Captions are drawn with bundled fonts
// (not inside the SVG) so they render identically everywhere.
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

export interface StickerDef {
  id: string;
  name: string;
  /** width / height */
  aspect: number;
  caption?: StickerCaption;
}

export const STICKERS: StickerDef[] = [
  { id: 'wow', name: 'Wow burst', aspect: 4 / 3, caption: { text: 'WOW', font: 'Bebas Neue', weight: 400, color: '#ff3864', stroke: '#1b1b1b', x: 0.5, y: 0.53, size: 0.4, rotate: -0.1 } },
  { id: 'heart', name: 'Heart', aspect: 300 / 280 },
  { id: 'star', name: 'Happy star', aspect: 300 / 290 },
  { id: 'lol', name: 'LOL bubble', aspect: 4 / 3, caption: { text: 'LOL', font: 'Bebas Neue', weight: 400, color: '#7b5cff', x: 0.5, y: 0.42, size: 0.46 } },
  { id: 'arrow', name: 'Arrow', aspect: 2 },
  { id: 'sunglasses', name: 'Sunglasses', aspect: 400 / 170 },
  { id: 'party', name: 'Party hat', aspect: 260 / 320 },
  { id: 'theend', name: 'The End banner', aspect: 480 / 180, caption: { text: 'The End', font: 'Pacifico', weight: 400, color: '#ffffff', x: 0.5, y: 0.42, size: 0.36 } },
];
