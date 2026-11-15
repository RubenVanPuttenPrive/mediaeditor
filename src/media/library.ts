// Runtime access to media blobs and object URLs. Object URLs are created lazily and revoked when the
// media is dropped from the project, so they do not pile up in memory.
import { getBlob } from './db';
import type { MediaInfo } from '../model/types';

const blobs = new Map<string, Blob>();
const urls = new Map<string, string>();

export function rememberBlob(id: string, blob: Blob) {
  blobs.set(id, blob);
}

export async function blobFor(m: MediaInfo): Promise<Blob> {
  const cached = blobs.get(m.id);
  if (cached) return cached;
  let blob: Blob | null = null;
  if (m.builtinUrl) {
    const res = await fetch(m.builtinUrl);
    if (!res.ok) throw new Error(`Could not load ${m.name}`);
    blob = await res.blob();
  } else {
    blob = await getBlob(m.id);
  }
  if (!blob) throw new Error(`Missing media data for ${m.name}`);
  blobs.set(m.id, blob);
  return blob;
}

export async function urlFor(m: MediaInfo): Promise<string> {
  const existing = urls.get(m.id);
  if (existing) return existing;
  const url = URL.createObjectURL(await blobFor(m));
  urls.set(m.id, url);
  return url;
}

export function releaseMedia(id: string) {
  const url = urls.get(id);
  if (url) URL.revokeObjectURL(url);
  urls.delete(id);
  blobs.delete(id);
}
