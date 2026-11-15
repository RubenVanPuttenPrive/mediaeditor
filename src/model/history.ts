// Snapshot undo/redo. Continuous gestures (dragging, sliders) are coalesced into one undo step:
// call begin() on pointer down, update() while moving and end() on release.

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** Snapshot taken at begin(); non-null while a gesture is in progress. */
  pending: T | null;
}

export const HISTORY_LIMIT = 100;

export const createHistory = <T>(present: T): History<T> => ({ past: [], present, future: [], pending: null });

/** A normal edit: one undo step. */
export function push<T>(h: History<T>, next: T, limit = HISTORY_LIMIT): History<T> {
  if (Object.is(next, h.present)) return h;
  if (h.pending !== null) return { ...h, present: next, future: [] };
  return { past: [...h.past, h.present].slice(-limit), present: next, future: [], pending: null };
}

export function begin<T>(h: History<T>): History<T> {
  return h.pending !== null ? h : { ...h, pending: h.present };
}

/** Change during a gesture: replaces the present without adding an undo step. */
export function update<T>(h: History<T>, next: T): History<T> {
  if (h.pending === null) return push(h, next);
  return Object.is(next, h.present) ? h : { ...h, present: next };
}

export function end<T>(h: History<T>, limit = HISTORY_LIMIT): History<T> {
  if (h.pending === null) return h;
  if (Object.is(h.pending, h.present)) return { ...h, pending: null };
  return { past: [...h.past, h.pending].slice(-limit), present: h.present, future: [], pending: null };
}

export function undo<T>(h: History<T>): History<T> {
  const settled = end(h);
  if (settled.past.length === 0) return settled;
  const prev = settled.past[settled.past.length - 1];
  return { past: settled.past.slice(0, -1), present: prev, future: [settled.present, ...settled.future], pending: null };
}

export function redo<T>(h: History<T>): History<T> {
  const settled = end(h);
  if (settled.future.length === 0) return settled;
  const [next, ...rest] = settled.future;
  return { past: [...settled.past, settled.present], present: next, future: rest, pending: null };
}

export const canUndo = (h: History<unknown>) => h.past.length > 0 || (h.pending !== null && h.pending !== h.present);
export const canRedo = (h: History<unknown>) => h.future.length > 0;
