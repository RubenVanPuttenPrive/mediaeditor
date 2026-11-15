import { useEditor, useProject } from '../state/store';
import { formatTime, projectDuration } from '../model/time';
import { t } from '../i18n/strings';
import { Icon } from './icons';
import { deleteSelection, pausePlayback, splitAtPlayhead, togglePlay } from './App';
import { importToTimeline } from './TopBar';
import type { Panel } from '../state/store';

function TimeReadout() {
  const time = useEditor((s) => s.time);
  const total = projectDuration(useProject());
  return (
    <div className="timecode" aria-label={t('play.time', { time: formatTime(time), total: formatTime(total) })}>
      <span className="now">{formatTime(time)}</span>
      <span className="total"> / {formatTime(total)}</span>
    </div>
  );
}

export function Transport() {
  const playing = useEditor((s) => s.playing);
  const selection = useEditor((s) => s.selection);
  const project = useProject();
  const s = useEditor.getState();
  const hasContent = project.clips.length > 0 || project.overlays.length > 0 || project.music.length > 0;
  const open = (p: Panel) => {
    pausePlayback();
    s.openPanel(p);
  };
  return (
    <div className="transport">
      <div className="transport-play">
        <button className="icon-btn" onClick={() => { pausePlayback(); s.seek(0); }} aria-label={t('play.toStart')} title={t('play.toStart')} disabled={!hasContent}>
          <Icon name="start" />
        </button>
        <button className="play-btn" onClick={togglePlay} aria-label={playing ? t('play.pause') : t('play.play')}
          title={`${playing ? t('play.pause') : t('play.play')} (Space)`} disabled={!hasContent} data-testid="play">
          <Icon name={playing ? 'pause' : 'play'} size={26} />
        </button>
        <TimeReadout />
      </div>
      <div className="tools" role="toolbar" aria-label={t('tool.toolbar')}>
        <ToolButton icon="plus" label={t('tool.addMedia')} onClick={() => void importToTimeline()} />
        <ToolButton icon="split" label={t('tool.split')} shortcut="S" onClick={splitAtPlayhead} disabled={!hasContent} />
        <ToolButton icon="trash" label={t('tool.delete')} shortcut="Delete" onClick={deleteSelection} disabled={!selection} />
        <ToolButton icon="music" label={t('tool.music')} onClick={() => open('music')} tone="music" />
        <ToolButton icon="emoji" label={t('tool.emoji')} onClick={() => open('emoji')} tone="overlay" />
        <ToolButton icon="sticker" label={t('tool.stickers')} onClick={() => open('stickers')} tone="overlay" />
        <ToolButton icon="text" label={t('tool.text')} onClick={() => open('text')} tone="overlay" />
      </div>
    </div>
  );
}

function ToolButton(props: { icon: string; label: string; onClick: () => void; disabled?: boolean; shortcut?: string; tone?: string }) {
  return (
    <button className={`tool ${props.tone ?? ''}`} onClick={props.onClick} disabled={props.disabled}
      title={props.shortcut ? `${props.label} (${props.shortcut})` : props.label}>
      <Icon name={props.icon} />
      <span>{props.label}</span>
    </button>
  );
}
