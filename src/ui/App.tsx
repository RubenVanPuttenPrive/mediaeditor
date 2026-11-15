import { useEffect } from 'react';
import { useEditor, getProject } from '../state/store';
import { loadState, saveState, requestPersistence, listBlobIds, deleteBlob } from '../media/db';
import { engine } from '../preview/engine';
import { referencedMedia, removeItem, splitClipAt, splitMusicAt } from '../model/timeline';
import { t, useLocale } from '../i18n/strings';
import { TopBar } from './TopBar';
import { Preview } from './Preview';
import { Transport } from './Transport';
import { Timeline } from './Timeline';
import { Inspector } from './Inspector';
import { Panels } from './Panels';
import { Toast } from './Toast';

export function togglePlay() {
  const s = useEditor.getState();
  if (engine.isPlaying) {
    engine.pause();
    s.setPlaying(false);
  } else {
    engine.play();
    s.setPlaying(engine.isPlaying);
  }
}

export function pausePlayback() {
  if (engine.isPlaying) {
    engine.pause();
    useEditor.getState().setPlaying(false);
  }
}

export function splitAtPlayhead() {
  const s = useEditor.getState();
  const p = getProject();
  const sel = s.selection && p.music.find((m) => m.id === s.selection);
  const r = sel ? splitMusicAt(p, sel.id, s.time) : splitClipAt(p, s.time);
  if (r.newId) {
    s.apply(() => r.project);
    s.select(r.newId);
  }
}

export function deleteSelection() {
  const s = useEditor.getState();
  if (!s.selection) return;
  const id = s.selection;
  s.apply((p) => removeItem(p, id));
  s.select(null);
}

function useRestoreAndAutosave() {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await loadState();
      if (cancelled) return;
      if (saved && (saved.project.clips.length || saved.project.music.length || saved.project.overlays.length)) {
        useEditor.getState().load(saved.project, saved.media);
      } else {
        useEditor.setState({ restored: true });
      }
      // Drop stored files no longer used by the project.
      const used = referencedMedia(useEditor.getState().history.present);
      for (const id of await listBlobIds()) if (!used.has(id)) await deleteBlob(id);
    })();
    void requestPersistence();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let timer = 0;
    const save = () => {
      const s = useEditor.getState();
      if (!s.restored) return;
      const used = referencedMedia(s.history.present);
      const media = Object.fromEntries(Object.entries(s.media).filter(([id]) => used.has(id)));
      void saveState({ project: s.history.present, media });
    };
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.history.present !== prev.history.present || s.media !== prev.media) {
        clearTimeout(timer);
        timer = window.setTimeout(save, 500);
      }
    });
    // Phones may kill a backgrounded tab at any time: save immediately when hidden.
    const onHide = () => document.visibilityState === 'hidden' && save();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    return () => {
      unsub();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', save);
    };
  }, []);
}

function useEngineSync() {
  useEffect(() => {
    engine.setCallbacks(
      (time) => useEditor.setState({ time }),
      () => useEditor.getState().setPlaying(false),
    );
    const s0 = useEditor.getState();
    void engine.setProject(s0.history.present, s0.media);
    return useEditor.subscribe((s, prev) => {
      if (s.history.present !== prev.history.present || s.media !== prev.media) void engine.setProject(s.history.present, s.media);
      if (s.time !== prev.time && Math.abs(s.time - engine.currentTime) > 1e-4) engine.seek(s.time);
    });
  }, []);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.closest('input, textarea, select, [contenteditable="true"]');
      const s = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        if (typing) return;
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        if (typing) return;
        e.preventDefault();
        s.redo();
        return;
      }
      if (typing || mod || e.altKey || document.querySelector('dialog[open]')) return;
      if (e.key === ' ' && !el.closest('button, [role="slider"]')) {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        splitAtPlayhead();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selection) {
        e.preventDefault();
        deleteSelection();
      } else if (e.key === 'Escape') {
        s.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  useLocale(); // re-render everything when the language changes
  useRestoreAndAutosave();
  useEngineSync();
  useShortcuts();
  const restored = useEditor((s) => s.restored);
  const busy = useEditor((s) => s.busy);
  const hasSelection = useEditor((s) => !!s.selection);
  return (
    <div className={`app ${hasSelection ? 'has-selection' : ''}`}>
      <TopBar />
      <main className="stage">
        <Preview />
        <Transport />
      </main>
      <section className="edit" aria-label={t('track.timeline')}>
        <Timeline />
        <Inspector />
      </section>
      <Panels />
      <Toast />
      {(!restored || busy) && (
        <div className="busy" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          {busy ?? t('app.restoring')}
        </div>
      )}
    </div>
  );
}
