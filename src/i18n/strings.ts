// UI text. English (./en.ts) is bundled; other languages live in ./locales/<code>.ts and are loaded
// on demand. The language follows the device/browser settings unless the user picks one in About.
import { useSyncExternalStore } from 'react';
import { en } from './en';
import LOCALE_LIST from './locales.json';

export type StringKey = keyof typeof en;
export type Table = Record<StringKey, string>;
export interface LocaleInfo { code: string; name: string }

export const LOCALES: LocaleInfo[] = LOCALE_LIST;
const PREF_KEY = 'mediaeditor.lang';
const loaders = import.meta.glob<{ default: Table }>('./locales/*.ts');

let current = 'en';
let table: Table = en;
const listeners = new Set<() => void>();

/** Best supported language for a list of BCP 47 tags (e.g. navigator.languages), else English. */
export function matchLocale(tags: readonly string[]): string {
  for (const tag of tags) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (LOCALES.some((l) => l.code === base)) return base;
  }
  return 'en';
}

export function deviceLocale(): string {
  if (typeof navigator === 'undefined') return 'en';
  return matchLocale(navigator.languages?.length ? navigator.languages : [navigator.language ?? 'en']);
}

/** The saved choice: a locale code, or 'auto' to follow the device. */
export function localePreference(): string {
  try {
    return localStorage.getItem(PREF_KEY) ?? 'auto';
  } catch {
    return 'auto';
  }
}

async function load(code: string): Promise<Table> {
  if (code === 'en') return en;
  const loader = loaders[`./locales/${code}.ts`];
  if (!loader) return en;
  try {
    return (await loader()).default;
  } catch {
    return en;
  }
}

/** Switches language ('auto' = device language) and remembers the choice. */
export async function setLocale(pref: string) {
  try {
    if (pref === 'auto') localStorage.removeItem(PREF_KEY);
    else localStorage.setItem(PREF_KEY, pref);
  } catch {
    /* storage unavailable: still switch for this session */
  }
  const code = pref === 'auto' ? deviceLocale() : matchLocale([pref]);
  table = await load(code);
  current = code;
  if (typeof document !== 'undefined') document.documentElement.lang = code;
  listeners.forEach((l) => l());
}

/** Call once before the first render. */
export const initLocale = () => setLocale(localePreference());

export const getLocale = () => current;

/** Re-renders the calling component when the language changes. */
export function useLocale(): string {
  return useSyncExternalStore((cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }, getLocale, getLocale);
}

export function t(key: StringKey, params?: Record<string, string | number>): string {
  let s: string = table[key] ?? en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function formatBytes(n: number) {
  const num = (v: number) => v.toLocaleString(current, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  return n >= 1024 ** 3 ? t('unit.gb', { n: num(n / 1024 ** 3) }) : t('unit.mb', { n: num(Math.max(0.1, n / 1024 ** 2)) });
}
