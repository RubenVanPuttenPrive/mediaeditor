import { lazy, Suspense, useEffect, useState } from 'react';
import { useEditor, getProject } from '../state/store';
import { addMusic, addOverlay, musicFromMedia, newId } from '../model/timeline';
import { projectDuration } from '../model/time';
import type { Overlay, TextOverlay } from '../model/types';
import { STICKERS } from '../render/stickers';
import { BUILTIN_TRACKS, builtinMedia, trackUrl } from '../render/music';
import { stickerUrl } from '../render/assets';
import { t } from '../i18n/strings';
import { formatTime } from '../model/time';
import { Dialog } from './Dialog';
import { Icon } from './icons';
import { TextStyleFields } from './Inspector';
import { importFiles, pickFiles } from '../lib/importFiles';
import { engine } from '../preview/engine';

const EmojiPicker = lazy(() => import('./EmojiPicker'));
const ExportDialog = lazy(() => import('./ExportDialog'));
const AboutDialog = lazy(() => import('./AboutDialog'));

export const OVERLAY_SECONDS = 3;

type NewOverlay =
  | Omit<Extract<Overlay, { kind: 'emoji' }>, 'id' | 'start' | 'duration' | 'x' | 'y' | 'rotation' | 'scale'>
  | Omit<Extract<Overlay, { kind: 'sticker' }>, 'id' | 'start' | 'duration' | 'x' | 'y' | 'rotation' | 'scale'>
  | Omit<TextOverlay, 'id' | 'start' | 'duration' | 'x' | 'y' | 'rotation' | 'scale'>;

/** Adds an overlay at the playhead, centred, for a few seconds. */
export function addOverlayAtPlayhead(o: NewOverlay, scale = 0.28) {
  const s = useEditor.getState();
  const p = getProject();
  const dur = projectDuration(p);
  let start = s.time;
  if (dur > OVERLAY_SECONDS && start > dur - OVERLAY_SECONDS) start = dur - OVERLAY_SECONDS;
  if (dur > 0 && start >= dur) start = 0;
  // Nudge new overlays so several added in a row do not sit exactly on top of each other.
  const sameTime = p.overlays.filter((x) => Math.abs(x.start - start) < 0.5).length;
  const offset = (sameTime % 5) * 0.06;
  const overlay = {
    ...o, id: newId('ov'), start: Math.max(0, start), duration: OVERLAY_SECONDS,
    x: 0.5 + offset, y: 0.5 - offset, scale, rotation: 0,
  } as Overlay;
  s.apply((pr) => addOverlay(pr, overlay));
  s.select(overlay.id);
  s.openPanel(null);
}

function StickerPanel({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title={t('stickers.title')} onClose={onClose}>
      <div className="sticker-grid">
        {STICKERS.map((st) => (
          <button key={st.id} className="sticker-btn" onClick={() => addOverlayAtPlayhead({ kind: 'sticker', sticker: st.id }, 0.4)}
            aria-label={t(st.nameKey)} title={t(st.nameKey)}>
            <img src={stickerUrl(st.id)} alt="" />
            {st.caption && <span className="sticker-caption" style={{ fontFamily: `"${st.caption.font}"`, color: st.caption.color }}>{st.caption.text}</span>}
          </button>
        ))}
      </div>
    </Dialog>
  );
}

function TextPanel({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<Pick<TextOverlay, 'text' | 'font' | 'color' | 'outline' | 'shadow'>>({
    text: '', font: 'Bebas Neue', color: '#ffffff', outline: true, shadow: true,
  });
  return (
    <Dialog title={t('text.title')} onClose={onClose}>
      <form className="text-form" onSubmit={(e) => {
        e.preventDefault();
        if (draft.text.trim()) addOverlayAtPlayhead({ kind: 'text', ...draft }, 0.6);
      }}>
        <label className="visually-hidden" htmlFor="new-text">{t('text.placeholder')}</label>
        <textarea id="new-text" rows={2} placeholder={t('text.placeholder')} value={draft.text} autoFocus
          style={{ fontFamily: `"${draft.font}"`, color: draft.color }}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
        <TextStyleFields o={draft} onChange={(p) => setDraft({ ...draft, ...p })} />
        <button type="submit" className="btn primary" disabled={!draft.text.trim()}>{t('text.add')}</button>
      </form>
    </Dialog>
  );
}

function MusicPanel({ onClose }: { onClose: () => void }) {
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => () => engine.stopAudition(), []);
  const audition = (id: string) => {
    if (playing === id) {
      engine.stopAudition();
      setPlaying(null);
    } else {
      engine.previewAudio(trackUrl(id));
      setPlaying(id);
    }
  };
  const addBuiltin = async (id: string) => {
    engine.stopAudition();
    const tr = BUILTIN_TRACKS.find((x) => x.id === id)!;
    const s = useEditor.getState();
    const info = builtinMedia(tr, tr.duration);
    s.addMedia(info);
    const p = getProject();
    const m = musicFromMedia(info, p.music.length ? Math.min(s.time, projectDuration(p)) : 0);
    // Fit the music to the video by default, with a gentle fade-out at the end.
    const dur = projectDuration(p);
    if (dur > 0 && m.start + (m.out - m.in) > dur) m.out = Math.max(1, dur - m.start);
    m.fadeOut = Math.min(2, (m.out - m.in) / 2);
    s.apply((pr) => addMusic(pr, m));
    s.select(m.id);
    s.openPanel(null);
  };
  return (
    <Dialog title={t('music.title')} onClose={onClose}>
      <button className="btn wide" onClick={async () => {
        engine.stopAudition();
        const files = await pickFiles('audio/*,.mp3,.m4a,.wav,.aac', false);
        if (files.length) {
          onClose();
          await importFiles(files, 'music');
        }
      }}>
        <Icon name="import" />
        {t('music.import')}
      </button>
      <h3 className="sheet-subtitle">{t('music.library')}</h3>
      <ul className="track-list">
        {BUILTIN_TRACKS.map((tr) => (
          <li key={tr.id}>
            <button className="icon-btn" onClick={() => audition(tr.id)}
              aria-label={playing === tr.id ? t('music.stopPreview') : t('music.preview', { name: tr.title })}>
              <Icon name={playing === tr.id ? 'pause' : 'play'} />
            </button>
            <div className="track-meta">
              <span className="track-title">{tr.title}</span>
              <span className="track-sub">{t(tr.style)} · {formatTime(tr.duration, false)} · {tr.license}</span>
            </div>
            <button className="btn" onClick={() => void addBuiltin(tr.id)}>{t('music.add')}</button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

export function Panels() {
  const panel = useEditor((s) => s.panel);
  const close = () => useEditor.getState().openPanel(null);
  if (!panel) return null;
  return (
    <Suspense fallback={<div className="busy" role="status"><span className="spinner" aria-hidden="true" /></div>}>
      {panel === 'music' && <MusicPanel onClose={close} />}
      {panel === 'stickers' && <StickerPanel onClose={close} />}
      {panel === 'text' && <TextPanel onClose={close} />}
      {panel === 'emoji' && <EmojiPicker onClose={close} />}
      {panel === 'export' && <ExportDialog onClose={close} />}
      {panel === 'about' && <AboutDialog onClose={close} />}
    </Suspense>
  );
}
