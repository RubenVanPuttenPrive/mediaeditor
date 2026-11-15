import { useEditor } from '../state/store';
import { canRedo, canUndo } from '../model/history';
import { t } from '../i18n/strings';
import { Icon } from './icons';
import { importFiles, pickFiles } from '../lib/importFiles';
import { pausePlayback } from './App';
import { deleteBlob } from '../media/db';
import { releaseMedia } from '../media/library';
import type { AspectRatio } from '../model/types';

const ASPECTS: AspectRatio[] = ['16:9', '9:16', '1:1'];

export async function importToTimeline() {
  const files = await pickFiles('video/*,image/*');
  if (files.length) await importFiles(files, 'timeline');
}

export async function newProject() {
  if (!window.confirm(t('top.newProjectConfirm'))) return false;
  pausePlayback();
  for (const id of Object.keys(useEditor.getState().media)) {
    releaseMedia(id);
    await deleteBlob(id);
  }
  useEditor.getState().reset();
  return true;
}

export function TopBar() {
  const history = useEditor((s) => s.history);
  const aspect = history.present.aspect;
  const s = useEditor.getState();
  const empty = !history.present.clips.length && !history.present.overlays.length && !history.present.music.length;

  return (
    <header className="topbar">
      <div className="brand">
        <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width="28" height="28" />
        <span className="brand-name">{t('app.name')}</span>
        <span className="privacy-chip" title={t('app.privacy')}>
          <Icon name="lock" size={14} />
          <span>{t('app.privacyShort')}</span>
        </span>
      </div>
      <div className="topbar-actions">
        <button className="icon-btn" onClick={() => s.undo()} disabled={!canUndo(history)} aria-label={t('top.undo')} title={`${t('top.undo')} (Ctrl+Z)`}>
          <Icon name="undo" />
        </button>
        <button className="icon-btn" onClick={() => s.redo()} disabled={!canRedo(history)} aria-label={t('top.redo')} title={`${t('top.redo')} (Ctrl+Shift+Z)`}>
          <Icon name="redo" />
        </button>
        <div className="segmented" role="radiogroup" aria-label={t('top.aspect')}>
          {ASPECTS.map((a) => (
            <button key={a} role="radio" aria-checked={aspect === a} className={aspect === a ? 'on' : ''}
              onClick={() => s.apply((p) => (p.aspect === a ? p : { ...p, aspect: a }))}>
              {a}
            </button>
          ))}
        </div>
        <button className="icon-btn" onClick={() => s.openPanel('about')} aria-label={t('top.about')} title={t('top.about')}>
          <Icon name="info" />
        </button>
        <button className="btn primary export-btn" aria-label={t('top.export')} onClick={() => { pausePlayback(); s.openPanel('export'); }} disabled={empty}>
          <Icon name="export" size={20} />
          <span>{t('top.export')}</span>
        </button>
      </div>
    </header>
  );
}
