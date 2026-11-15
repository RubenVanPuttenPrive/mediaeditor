import { create } from 'zustand';
import * as H from '../model/history';
import { emptyProject, type MediaInfo, type Project } from '../model/types';
import { projectDuration, clamp } from '../model/time';

export type Panel = null | 'music' | 'emoji' | 'stickers' | 'text' | 'export' | 'about';

export interface EditorState {
  history: H.History<Project>;
  media: Record<string, MediaInfo>;
  selection: string | null;
  time: number;
  playing: boolean;
  pxPerSec: number;
  panel: Panel;
  toast: { text: string; id: number } | null;
  busy: string | null;
  restored: boolean;

  /** Applies an edit. Inside a gesture (begin/end) the steps are merged into one undo entry. */
  apply: (fn: (p: Project) => Project) => void;
  begin: () => void;
  end: () => void;
  undo: () => void;
  redo: () => void;
  addMedia: (m: MediaInfo) => void;
  select: (id: string | null) => void;
  seek: (t: number) => void;
  setPlaying: (v: boolean) => void;
  setZoom: (pxPerSec: number) => void;
  openPanel: (p: Panel) => void;
  showToast: (text: string) => void;
  setBusy: (text: string | null) => void;
  load: (project: Project, media: Record<string, MediaInfo>) => void;
  reset: () => void;
}

export const MIN_ZOOM = 4;
export const MAX_ZOOM = 400;

export const useEditor = create<EditorState>()((set, get) => ({
  history: H.createHistory(emptyProject()),
  media: {},
  selection: null,
  time: 0,
  playing: false,
  pxPerSec: 40,
  panel: null,
  toast: null,
  busy: null,
  restored: false,

  apply: (fn) =>
    set((s) => {
      const next = fn(s.history.present);
      if (next === s.history.present) return s;
      const history = s.history.pending ? H.update(s.history, next) : H.push(s.history, next);
      return { history, time: clamp(s.time, 0, Math.max(0, projectDuration(next))) };
    }),
  begin: () => set((s) => ({ history: H.begin(s.history) })),
  end: () => set((s) => ({ history: H.end(s.history) })),
  undo: () =>
    set((s) => {
      const history = H.undo(s.history);
      return { history, selection: keepSelection(history.present, s.selection) };
    }),
  redo: () =>
    set((s) => {
      const history = H.redo(s.history);
      return { history, selection: keepSelection(history.present, s.selection) };
    }),
  addMedia: (m) => set((s) => ({ media: { ...s.media, [m.id]: m } })),
  select: (id) => set({ selection: id }),
  seek: (t) => set({ time: clamp(t, 0, projectDuration(get().history.present)) }),
  setPlaying: (v) => set({ playing: v }),
  setZoom: (pxPerSec) => set({ pxPerSec: clamp(pxPerSec, MIN_ZOOM, MAX_ZOOM) }),
  openPanel: (panel) => set({ panel }),
  showToast: (text) => set({ toast: { text, id: Date.now() } }),
  setBusy: (busy) => set({ busy }),
  load: (project, media) => set({ history: H.createHistory(project), media, restored: true, time: 0, selection: null }),
  reset: () =>
    set({ history: H.createHistory(emptyProject()), media: {}, selection: null, time: 0, playing: false, panel: null }),
}));

function keepSelection(p: Project, id: string | null) {
  if (!id) return null;
  const exists = p.clips.some((c) => c.id === id) || p.music.some((m) => m.id === id) || p.overlays.some((o) => o.id === id);
  return exists ? id : null;
}

export const useProject = () => useEditor((s) => s.history.present);
export const getProject = () => useEditor.getState().history.present;
