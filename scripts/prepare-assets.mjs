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

// Copy each Twemoji SVG that has metadata, remembering its file name.
const fileOf = new Map();
for (const e of emojiData) {
  if (e.group === undefined || e.group === 2) continue; // skip components (skin tone swatches etc.)
  const candidates = [e.hexcode.toLowerCase(), e.hexcode.toLowerCase().replace(/-fe0f/g, '')];
  const file = candidates.find((c) => available.has(c + '.svg'));
  if (!file) continue;
  const dest = join(svgOut, file + '.svg');
  if (!existsSync(dest)) copyFileSync(join(twemojiDir, file + '.svg'), dest);
  fileOf.set(e.hexcode, file);
}

// One search index per UI language: localised names and keywords, plus the English ones so English
// search terms keep working everywhere. Format: [file, unicode, label, group, tags].
const locales = JSON.parse(readFileSync(join(root, 'src', 'i18n', 'locales.json'), 'utf8')).map((l) => l.code);
let count = 0;
for (const code of locales) {
  let data = emojiData;
  let msgs = messages;
  try {
    data = require(`emojibase-data/${code}/compact.json`);
    msgs = require(`emojibase-data/${code}/messages.json`);
  } catch {
    console.warn(`prepare-assets: no emoji data for ${code}, using English`);
  }
  const local = new Map(data.map((e) => [e.hexcode, e]));
  const index = [];
  for (const e of emojiData) {
    const file = fileOf.get(e.hexcode);
    if (!file) continue;
    const l = local.get(e.hexcode);
    const label = l?.label ?? e.label;
    const tags = new Set([...(l?.tags ?? []), ...(code === 'en' ? [] : [e.label, ...(e.tags ?? [])])]);
    index.push([file, e.unicode, label, e.group, [...tags].join(' ')]);
  }
  const groups = msgs.groups.filter((g) => g.order !== 2).map((g) => ({ id: g.order, key: g.key, label: g.message }));
  writeFileSync(join(pub, 'emoji', `index-${code}.json`), JSON.stringify({ groups, emoji: index }));
  count = index.length;
}

const ffOut = join(pub, 'ffmpeg');
mkdirSync(ffOut, { recursive: true });
const coreDir = join(root, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm');
for (const f of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  const dest = join(ffOut, f);
  if (!existsSync(dest)) copyFileSync(join(coreDir, f), dest);
}
console.log(`prepare-assets: ${count} emoji in ${locales.length} languages, ffmpeg core copied`);
