// Autosave: the project JSON, media metadata and the imported files themselves live in IndexedDB,
// so a refresh or the OS killing a background tab does not lose work.
import { openDB, type IDBPDatabase } from 'idb';
import type { MediaInfo, Project } from '../model/types';

const DB_NAME = 'mediaeditor';
let dbPromise: Promise<IDBPDatabase> | null = null;

function db() {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore('kv');
      d.createObjectStore('blobs');
    },
  });
  return dbPromise;
}

export interface SavedState {
  project: Project;
  media: Record<string, MediaInfo>;
}

export async function saveState(state: SavedState) {
  try {
    await (await db()).put('kv', state, 'current');
  } catch (e) {
    console.warn('autosave failed', e);
  }
}

export async function loadState(): Promise<SavedState | null> {
  try {
    return ((await (await db()).get('kv', 'current')) as SavedState | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Largest file we are willing to copy into memory to store it as an ArrayBuffer (last resort). */
const MAX_BUFFER_COPY = 256 * 1024 * 1024;

async function opfsDir() {
  if (!navigator.storage?.getDirectory) return null;
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('media', { create: true });
}

/**
 * Stores an imported file. Tries, in order: a Blob in IndexedDB (cheap, the browser keeps it on disk),
 * a file in the origin-private file system, and finally an ArrayBuffer copy for smaller files.
 */
export async function putBlob(id: string, blob: Blob) {
  const d = await db();
  try {
    await d.put('blobs', blob, id);
    return;
  } catch {
    /* some engines refuse Blobs in IndexedDB */
  }
  try {
    const dir = await opfsDir();
    if (dir) {
      const handle = await dir.getFileHandle(id, { create: true });
      if (typeof (handle as FileSystemFileHandle & { createWritable?: unknown }).createWritable === 'function') {
        const w = await handle.createWritable();
        await blob.stream().pipeTo(w);
        await d.put('blobs', { opfs: true, type: blob.type }, id);
        return;
      }
    }
  } catch {
    /* fall through */
  }
  if (blob.size > MAX_BUFFER_COPY) throw new Error('storage');
  await d.put('blobs', { buffer: await blob.arrayBuffer(), type: blob.type }, id);
}

type Stored = Blob | { opfs: true; type: string } | { buffer: ArrayBuffer; type: string };

export async function getBlob(id: string): Promise<Blob | null> {
  try {
    const v = (await (await db()).get('blobs', id)) as Stored | undefined;
    if (!v) return null;
    if (v instanceof Blob) return v;
    if ('buffer' in v) return new Blob([v.buffer], { type: v.type });
    const dir = await opfsDir();
    const file = await dir?.getFileHandle(id).then((h) => h.getFile());
    return file ? new Blob([file], { type: v.type }) : null;
  } catch {
    return null;
  }
}

export async function deleteBlob(id: string) {
  try {
    await (await db()).delete('blobs', id);
    await (await opfsDir())?.removeEntry(id).catch(() => null);
  } catch {
    /* ignore */
  }
}

export async function listBlobIds(): Promise<string[]> {
  try {
    return (await (await db()).getAllKeys('blobs')).map(String);
  } catch {
    return [];
  }
}

/** Asks the browser not to evict our storage under pressure (best effort). */
export async function requestPersistence() {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* ignore */
  }
}
