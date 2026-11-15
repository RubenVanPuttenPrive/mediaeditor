import { useEffect, useRef, useState } from 'react';
import { useEditor, getProject } from '../state/store';
import { formatTime, projectDuration } from '../model/time';
import { t, formatBytes } from '../i18n/strings';
import { Dialog } from './Dialog';
import { Icon } from './icons';
import type { ExportMethod, ExportProgress, ExportResult } from '../export/exporter';

type State =
  | { kind: 'idle' }
  | { kind: 'running'; progress: ExportProgress }
  | { kind: 'done'; result: ExportResult; url: string }
  | { kind: 'error'; message: string };

const methodLabel = (m: ExportMethod) =>
  m === 'webcodecs' ? t('export.methodWebCodecs') : m === 'webcodecs-wasm-aac' ? t('export.methodWasmAac') : t('export.methodFfmpeg');

/** Keeps the screen on during export (phones would otherwise sleep and suspend the page). */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
        if (stopped) void lock.release();
      } catch {
        /* not allowed right now */
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && void acquire();
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => null);
    };
  }, [active]);
}

export default function ExportDialog({ onClose }: { onClose: () => void }) {
  const [quality, setQuality] = useState<720 | 1080>(1080);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const abort = useRef<AbortController | null>(null);
  const duration = projectDuration(getProject());
  useWakeLock(state.kind === 'running');

  useEffect(() => () => {
    abort.current?.abort();
  }, []);
  useEffect(() => {
    if (state.kind === 'done') return () => URL.revokeObjectURL(state.url);
  }, [state]);

  const start = async () => {
    const controller = new AbortController();
    abort.current = controller;
    setState({ kind: 'running', progress: { stage: 'loading', progress: 0, eta: null } });
    try {
      const { exportProject } = await import('../export/exporter');
      const s = useEditor.getState();
      const result = await exportProject({
        project: s.history.present, media: s.media, shortSide: quality, signal: controller.signal,
        onProgress: (progress) => setState({ kind: 'running', progress }),
      });
      if (result.downscaled) s.showToast(t('export.downscaled'));
      setState({ kind: 'done', result, url: URL.createObjectURL(result.file) });
    } catch (e) {
      if (controller.signal.aborted) {
        setState({ kind: 'idle' });
        useEditor.getState().showToast(t('export.cancelled'));
      } else {
        console.error(e);
        setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    }
  };

  const share = async (file: File) => {
    try {
      await navigator.share({ files: [file], title: file.name });
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') useEditor.getState().showToast(t('export.shareFailed'));
    }
  };

  const running = state.kind === 'running';
  const canShareFile = (f: File) => {
    try {
      return typeof navigator.canShare === 'function' && navigator.canShare({ files: [f] });
    } catch {
      return false;
    }
  };

  return (
    <Dialog title={t('export.title')} onClose={() => { abort.current?.abort(); onClose(); }} closable={!running} className="export-sheet">
      {duration <= 0 && <p>{t('export.empty')}</p>}
      {duration > 0 && (state.kind === 'idle' || state.kind === 'error') && (
        <div className="export-setup">
          <fieldset className="quality">
            <legend>{t('export.quality')}</legend>
            {([720, 1080] as const).map((q) => (
              <label key={q} className={`quality-option ${quality === q ? 'on' : ''}`}>
                <input type="radio" name="quality" value={q} checked={quality === q} onChange={() => setQuality(q)} />
                <span className="q-main">{q}p</span>
                <span className="q-sub">MP4 · H.264 + AAC</span>
              </label>
            ))}
          </fieldset>
          <p className="muted">{formatTime(duration)} · {t('app.privacy')}</p>
          {state.kind === 'error' && <p className="error" role="alert">{t('export.failed', { reason: state.message })}</p>}
          <button className="btn primary big" onClick={() => void start()} data-testid="start-export">
            <Icon name="export" />
            {t('export.start')}
          </button>
        </div>
      )}
      {running && (
        <div className="export-progress">
          <p className="progress-label" aria-live="polite">
            {state.progress.stage === 'loading' ? t('export.loadingEncoder')
              : state.progress.stage === 'finishing' ? t('export.finishing')
              : t('export.rendering', { percent: Math.floor(state.progress.progress * 100) })}
          </p>
          <progress max={1} value={state.progress.progress} aria-label={t('export.title')} />
          <p className="muted">
            {state.progress.eta !== null && state.progress.stage === 'rendering' ? t('export.eta', { time: formatTime(state.progress.eta, false) }) : ' '}
          </p>
          <p className="muted small">{t('export.keepOpen')}</p>
          <button className="btn" onClick={() => abort.current?.abort()}>{t('export.cancel')}</button>
        </div>
      )}
      {state.kind === 'done' && (
        <div className="export-done">
          <video src={state.url} controls playsInline className="result-video" data-testid="result-video" />
          <p className="done-title">{t('export.done')}</p>
          <p className="muted small">
            {t('export.size', { size: formatBytes(state.result.file.size), duration: formatTime(state.result.duration) })} · {state.result.width}×{state.result.height} · {t('export.method', { method: methodLabel(state.result.method) })}
          </p>
          <div className="done-actions">
            {canShareFile(state.result.file) && (
              <button className="btn primary big" onClick={() => void share(state.result.file)}>
                <Icon name="share" />
                {t('export.share')}
              </button>
            )}
            <a className={`btn big ${canShareFile(state.result.file) ? '' : 'primary'}`} href={state.url} download={state.result.file.name} data-testid="download">
              <Icon name="download" />
              {t('export.download')}
            </a>
            <button className="btn" onClick={onClose}>{t('export.again')}</button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
