import { describe, expect, it } from 'vitest';
import { en } from './en';
import { LOCALES, matchLocale, setLocale, t, type Table } from './strings';

const tables = import.meta.glob<{ default: Table }>('./locales/*.ts', { eager: true });
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
// Keys that are legitimately identical in every language (brand names, units, pure placeholders).
const SAME_EVERYWHERE = new Set(['app.name', 'track.clip', 'export.size', 'inspect.seconds', 'unit.mb', 'unit.gb', 'tool.emoji', 'emoji.title']);

describe('translations', () => {
  it('has a file for every listed language', () => {
    for (const { code } of LOCALES) if (code !== 'en') expect(tables[`./locales/${code}.ts`], code).toBeDefined();
  });

  for (const [path, mod] of Object.entries(tables)) {
    const table = mod.default;
    it(`${path}: same keys and placeholders as English, nothing empty`, () => {
      expect(Object.keys(table).sort()).toEqual(Object.keys(en).sort());
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        expect(table[key].trim(), key).not.toBe('');
        expect(placeholders(table[key]), key).toEqual(placeholders(en[key]));
      }
    });
    it(`${path}: mostly translated`, () => {
      const same = (Object.keys(en) as (keyof typeof en)[]).filter((k) => table[k] === en[k] && !SAME_EVERYWHERE.has(k));
      // A few words are the same in many languages (Video, Clip, Volume, Original…), but not many.
      expect(same.length, same.join(', ')).toBeLessThan(15);
    });
  }
});

describe('language selection', () => {
  it('matches the device language list', () => {
    expect(matchLocale(['nl-NL', 'en-US'])).toBe('nl');
    expect(matchLocale(['de-AT'])).toBe('de');
    expect(matchLocale(['pt-BR'])).toBe('pt');
    expect(matchLocale(['ja-JP', 'fr-CA'])).toBe('fr');
    expect(matchLocale(['ja-JP'])).toBe('en');
    expect(matchLocale([])).toBe('en');
  });

  it('switches the strings', async () => {
    await setLocale('nl');
    expect(t('top.export')).toBe('Exporteren');
    expect(t('import.picking', { name: 'a.mp4' })).toBe('a.mp4 importeren…');
    await setLocale('en');
    expect(t('top.export')).toBe('Export');
  });
});
