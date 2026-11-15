// Copies lazily-loaded assets into public/ (generated, git-ignored):
//  - Twemoji SVGs that have emojibase metadata, plus a compact search index
//  - the single-threaded ffmpeg core used by the export fallback
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = dirname(dirname(new URL(import.meta.url).pathname));
const pub = join(root, 'public');
const twemojiDir = dirname(require.resolve('@twemoji/svg/package.json'));
const emojiData = require('emojibase-data/en/compact.json');
const messages = require('emojibase-data/en/messages.json');

const svgOut = join(pub, 'emoji', 'svg');
mkdirSync(svgOut, { recursive: true });
const available = new Set(readdirSync(twemojiDir).filter((f) => f.endsWith('.svg')));

const index = [];
for (const e of emojiData) {
  if (e.group === undefined || e.group === 2) continue; // skip components (skin tone swatches etc.)
  const candidates = [e.hexcode.toLowerCase(), e.hexcode.toLowerCase().replace(/-fe0f/g, '')];
  const file = candidates.find((c) => available.has(c + '.svg'));
  if (!file) continue;
  const dest = join(svgOut, file + '.svg');
  if (!existsSync(dest)) copyFileSync(join(twemojiDir, file + '.svg'), dest);
  // [file, unicode, label, group, tags]
  index.push([file, e.unicode, e.label, e.group, (e.tags || []).join(' ')]);
}
const groups = messages.groups.filter((g) => g.order !== 2).map((g) => ({ id: g.order, key: g.key, label: g.message }));
writeFileSync(join(pub, 'emoji', 'index.json'), JSON.stringify({ groups, emoji: index }));

const ffOut = join(pub, 'ffmpeg');
mkdirSync(ffOut, { recursive: true });
const coreDir = join(root, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm');
for (const f of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  const dest = join(ffOut, f);
  if (!existsSync(dest)) copyFileSync(join(coreDir, f), dest);
}
console.log(`prepare-assets: ${index.length} emoji, ffmpeg core copied`);
