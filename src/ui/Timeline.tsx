// The timeline keeps the playhead fixed in the middle and slides the tracks underneath it, so on a
// phone scrubbing is just dragging. Everything is driven by Pointer Events (touch-action: none):
//   one finger/mouse on empty space → scrub;  two fingers → pinch zoom;  Ctrl+wheel → zoom
//   handles → trim;  mouse drag on an item, or touch-and-hold → move/reorder;  tap → select
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useEditor, useProject, getProject } from '../state/store';
import { clipDuration, clipStarts, formatTime, musicEnd, projectDuration, clamp } from '../model/time';
import { dropIndex, moveClip, trimClip, trimMusic, updateMusic, updateOverlay } from '../model/timeline';
import type { MediaInfo, MusicClip, Overlay, Project, VideoClip } from '../model/types';
import type { Thumb } from '../media/thumbnails';
import { t } from '../i18n/strings';
import { Icon } from './icons';
import { pausePlayback } from './App';
import { MIN_CLIP } from '../model/time';

const HOLD_MS = 350;
const MOVE_SLOP = 8;

type DragKind = 'pan' | 'pinch' | 'trim' | 'move' | 'pending';

interface Drag {
  kind: DragKind;
  pointerId: number;
  pointerType: string;
  x0: number;
  t0: number;
  itemId?: string;
  itemKind?: 'clip' | 'music' | 'overlay';
  edge?: 'in' | 'out';
  orig?: { in: number; out: number; start: number; duration: number; index: number };
  holdTimer?: number;
  moved: boolean;
  onRuler?: boolean;
}

function overlayLanes(overlays: Overlay[]): Map<string, number> {
  const sorted = [...overlays].sort((a, b) => a.start - b.start);
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();
  for (const o of sorted) {
    let lane = laneEnds.findIndex((end) => end <= o.start + 1e-6);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = o.start + o.duration;
    lanes.set(o.id, lane);
  }
  return lanes;
}

function tickStep(pps: number) {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  return steps.find((s) => s * pps >= 64) ?? 600;
}

export function Timeline() {
  const project = useProject();
  const media = useEditor((s) => s.media);
  const pps = useEditor((s) => s.pxPerSec);
  const selection = useEditor((s) => s.selection);
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, number>());
  const pinch = useRef<{ dist: number; pps: number } | null>(null);
  const [moveOffset, setMoveOffset] = useState<{ id: string; dx: number } | null>(null);
  const duration = projectDuration(project);
  const lanes = useMemo(() => overlayLanes(project.overlays), [project.overlays]);
  const laneCount = Math.max(1, ...[...lanes.values()].map((l) => l + 1));

  useLayoutEffect(() => {
    const el = rootRef.current!;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The content slides under the fixed playhead. Updated outside React for smooth playback.
  useEffect(() => {
    const apply = (time: number, z: number) => {
      if (contentRef.current) contentRef.current.style.transform = `translateX(${width / 2 - time * z}px)`;
    };
    const s = useEditor.getState();
    apply(s.time, s.pxPerSec);
    return useEditor.subscribe((st) => apply(st.time, st.pxPerSec));
  }, [width]);

  // Wheel: horizontal pan, Ctrl/Cmd (or trackpad pinch) zoom. Needs a non-passive listener.
  useEffect(() => {
    const el = rootRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = useEditor.getState();
      if (e.ctrlKey || e.metaKey) {
        s.setZoom(s.pxPerSec * Math.exp(-e.deltaY / 200));
      } else {
        pausePlayback();
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        s.seek(s.time + d / s.pxPerSec);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const timeAtClientX = (clientX: number) => {
    const r = rootRef.current!.getBoundingClientRect();
    const s = useEditor.getState();
    return s.time + (clientX - r.left - r.width / 2) / s.pxPerSec;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button > 0) return;
    rootRef.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, e.clientX);
    const s = useEditor.getState();
    if (pointers.current.size === 2) {
      // Pinch zoom: abandon whatever the first finger was doing.
      cancelDrag();
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.abs(a - b) || 1, pps: s.pxPerSec };
      drag.current = { kind: 'pinch', pointerId: e.pointerId, pointerType: e.pointerType, x0: e.clientX, t0: s.time, moved: true };
      return;
    }
    if (pointers.current.size > 2) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-item], [data-handle]');
    const p = getProject();
    const d: Drag = {
      kind: 'pan', pointerId: e.pointerId, pointerType: e.pointerType, x0: e.clientX, t0: s.time, moved: false,
      onRuler: !!(e.target as HTMLElement).closest('.ruler'),
    };
    if (el) {
      const id = el.dataset.id!;
      const kind = el.dataset.kind as Drag['itemKind'];
      d.itemId = id;
      d.itemKind = kind;
      d.orig = origOf(p, id, kind!);
      if (el.dataset.handle) {
        d.kind = 'trim';
        d.edge = el.dataset.handle as 'in' | 'out';
        pausePlayback();
        s.begin();
      } else if (e.pointerType === 'mouse') {
        d.kind = 'pending';
      } else {
        d.kind = 'pending';
        d.holdTimer = window.setTimeout(() => {
          if (drag.current === d && !d.moved) {
            d.kind = 'move';
            startMove(d);
            navigator.vibrate?.(15);
          }
        }, HOLD_MS);
      }
    }
    drag.current = d;
  };

  const startMove = (d: Drag) => {
    pausePlayback();
    const s = useEditor.getState();
    s.select(d.itemId!);
    s.begin();
    setMoveOffset({ id: d.itemId!, dx: 0 });
  };

  const cancelDrag = () => {
    const d = drag.current;
    if (!d) return;
    clearTimeout(d.holdTimer);
    if (d.kind === 'trim' || d.kind === 'move') useEditor.getState().end();
    setMoveOffset(null);
    drag.current = null;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, e.clientX);
    const d = drag.current;
    if (!d) return;
    const s = useEditor.getState();
    if (d.kind === 'pinch') {
      const [a, b] = [...pointers.current.values()];
      if (pinch.current && b !== undefined) s.setZoom(pinch.current.pps * (Math.abs(a - b) / pinch.current.dist));
      return;
    }
    if (e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.x0;
    if (!d.moved && Math.abs(dx) > (d.pointerType === 'mouse' ? 3 : MOVE_SLOP)) {
      d.moved = true;
      if (d.kind === 'pending') {
        clearTimeout(d.holdTimer);
        if (d.pointerType === 'mouse') {
          d.kind = 'move';
          startMove(d);
        } else {
          d.kind = 'pan';
        }
      }
      if (d.kind === 'pan') pausePlayback();
    }
    if (!d.moved) return;
    const dt = dx / s.pxPerSec;
    const p = getProject();
    const m = d.itemId ? p.clips.find((c) => c.id === d.itemId) ?? p.music.find((c) => c.id === d.itemId) : undefined;
    const info: MediaInfo | undefined = m ? s.media[m.mediaId] : undefined;
    if (d.kind === 'pan') {
      s.seek(d.t0 - dt);
    } else if (d.kind === 'trim' && d.orig) {
      const o = d.orig;
      if (d.itemKind === 'clip') {
        const max = info?.kind === 'image' ? Infinity : (info?.duration ?? o.out);
        s.apply((pr) => trimClip(pr, d.itemId!, d.edge!, (d.edge === 'in' ? o.in : o.out) + dt, max));
      } else if (d.itemKind === 'music') {
        s.apply((pr) => trimMusic(pr, d.itemId!, d.edge!, (d.edge === 'in' ? o.in : o.out) + dt, info?.duration ?? o.out));
      } else {
        const end = o.start + o.duration;
        const patch = d.edge === 'in'
          ? { start: clamp(o.start + dt, 0, end - MIN_CLIP), duration: clamp(end - (o.start + dt), MIN_CLIP, end) }
          : { duration: Math.max(MIN_CLIP, o.duration + dt) };
        s.apply((pr) => updateOverlay(pr, d.itemId!, patch));
      }
    } else if (d.kind === 'move' && d.orig) {
      if (d.itemKind === 'clip') {
        setMoveOffset({ id: d.itemId!, dx });
      } else if (d.itemKind === 'music') {
        s.apply((pr) => updateMusic(pr, d.itemId!, { start: Math.max(0, d.orig!.start + dt) }));
      } else {
        s.apply((pr) => updateOverlay(pr, d.itemId!, { start: Math.max(0, d.orig!.start + dt) }));
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pinch') {
      if (pointers.current.size === 0) {
        drag.current = null;
        pinch.current = null;
      }
      return;
    }
    if (e.pointerId !== d.pointerId) return;
    clearTimeout(d.holdTimer);
    const s = useEditor.getState();
    if (d.kind === 'move' && d.itemKind === 'clip' && d.orig) {
      const p = getProject();
      const starts = clipStarts(p.clips);
      const c = p.clips[d.orig.index];
      const centre = starts[d.orig.index] + clipDuration(c) / 2 + (e.clientX - d.x0) / s.pxPerSec;
      const to = dropIndex(p.clips, d.orig.index, centre);
      s.apply((pr) => moveClip(pr, d.orig!.index, to));
    }
    if (!d.moved && e.type === 'pointerup') {
      if (d.itemId) s.select(d.itemId);
      else if (d.onRuler) {
        pausePlayback();
        s.seek(timeAtClientX(e.clientX));
      } else s.select(null);
    }
    if (d.kind === 'trim' || d.kind === 'move') s.end();
    setMoveOffset(null);
    drag.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const s = useEditor.getState();
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      pausePlayback();
      const step = e.shiftKey ? 1 : 1 / 30;
      s.seek(s.time + (e.key === 'ArrowLeft' ? -step : step));
    } else if (e.key === '+' || e.key === '=') s.setZoom(s.pxPerSec * 1.25);
    else if (e.key === '-') s.setZoom(s.pxPerSec / 1.25);
  };

  const starts = clipStarts(project.clips);
  const contentWidth = Math.max(duration, 1) * pps;
  const step = tickStep(pps);
  const ticks: number[] = [];
  for (let x = 0; x <= duration + step && ticks.length < 2000; x += step) ticks.push(x);

  return (
    <div className="timeline-wrap">
      <div className="timeline-zoom">
        <button className="icon-btn small" aria-label={t('tool.zoomOut')} title={t('tool.zoomOut')}
          onClick={() => useEditor.getState().setZoom(pps / 1.5)}><Icon name="zoomOut" size={18} /></button>
        <button className="icon-btn small" aria-label={t('tool.zoomIn')} title={t('tool.zoomIn')}
          onClick={() => useEditor.getState().setZoom(pps * 1.5)}><Icon name="zoomIn" size={18} /></button>
      </div>
      <div className="timeline" ref={rootRef} tabIndex={0} role="group" aria-label={t('track.timeline')}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown} data-testid="timeline">
        <div className="timeline-content" ref={contentRef} style={{ width: contentWidth }}>
          <div className="ruler" aria-hidden="true">
            {ticks.map((x) => (
              <span key={x} className="tick" style={{ left: x * pps }}>{formatTime(x, step < 1)}</span>
            ))}
          </div>
          <div className="track track-video" aria-label={t('track.video')}>
            {project.clips.map((c, i) => (
              <ClipItem key={c.id} clip={c} media={media[c.mediaId]} left={starts[i] * pps} pps={pps}
                selected={selection === c.id} offset={moveOffset?.id === c.id ? moveOffset.dx : 0} />
            ))}
          </div>
          <div className="track track-music" aria-label={t('track.music')}>
            {project.music.length === 0 && <span className="track-hint">{t('track.emptyMusic')}</span>}
            {project.music.map((m) => (
              <MusicItem key={m.id} clip={m} media={media[m.mediaId]} pps={pps} selected={selection === m.id} />
            ))}
          </div>
          <div className="track track-overlay" style={{ height: laneCount * 34 + 10 }} aria-label={t('track.overlay')}>
            {project.overlays.length === 0 && <span className="track-hint">{t('track.emptyOverlay')}</span>}
            {project.overlays.map((o) => (
              <OverlayItem key={o.id} o={o} lane={lanes.get(o.id) ?? 0} pps={pps} selected={selection === o.id} />
            ))}
          </div>
        </div>
        <div className="playhead" aria-hidden="true"><span className="playhead-flag" /></div>
      </div>
    </div>
  );
}

function origOf(p: Project, id: string, kind: 'clip' | 'music' | 'overlay') {
  if (kind === 'clip') {
    const index = p.clips.findIndex((c) => c.id === id);
    const c = p.clips[index];
    return { in: c.in, out: c.out, start: 0, duration: clipDuration(c), index };
  }
  if (kind === 'music') {
    const m = p.music.find((x) => x.id === id)!;
    return { in: m.in, out: m.out, start: m.start, duration: m.out - m.in, index: 0 };
  }
  const o = p.overlays.find((x) => x.id === id)!;
  return { in: 0, out: 0, start: o.start, duration: o.duration, index: 0 };
}

function Handles({ id, kind, name }: { id: string; kind: string; name: string }) {
  const nudge = (edge: 'in' | 'out') => (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    e.stopPropagation();
    const s = useEditor.getState();
    const p = getProject();
    const d = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 0.1);
    if (kind === 'clip') {
      const c = p.clips.find((x) => x.id === id)!;
      const m = s.media[c.mediaId];
      s.apply((pr) => trimClip(pr, id, edge, (edge === 'in' ? c.in : c.out) + d, m?.kind === 'image' ? Infinity : (m?.duration ?? c.out)));
    } else if (kind === 'music') {
      const c = p.music.find((x) => x.id === id)!;
      s.apply((pr) => trimMusic(pr, id, edge, (edge === 'in' ? c.in : c.out) + d, s.media[c.mediaId]?.duration ?? c.out));
    } else {
      const o = p.overlays.find((x) => x.id === id)!;
      s.apply((pr) => updateOverlay(pr, id, edge === 'in'
        ? { start: Math.max(0, o.start + d), duration: Math.max(MIN_CLIP, o.duration - d) }
        : { duration: Math.max(MIN_CLIP, o.duration + d) }));
    }
  };
  return (
    <>
      <button className="handle handle-in" data-handle="in" data-id={id} data-kind={kind}
        aria-label={t('track.trimStart', { name })} onKeyDown={nudge('in')} tabIndex={0} />
      <button className="handle handle-out" data-handle="out" data-id={id} data-kind={kind}
        aria-label={t('track.trimEnd', { name })} onKeyDown={nudge('out')} tabIndex={0} />
    </>
  );
}

const ClipItem = memo(function ClipItem(props: { clip: VideoClip; media?: MediaInfo; left: number; pps: number; selected: boolean; offset: number }) {
  const { clip, media, left, pps, selected, offset } = props;
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  useEffect(() => {
    let live = true;
    if (media) void import('../media/thumbnails').then(({ thumbnailsFor }) => thumbnailsFor(media)).then((th) => live && setThumbs(th));
    return () => {
      live = false;
    };
  }, [media]);
  const w = clipDuration(clip) * pps;
  const tileW = 48;
  const n = Math.max(1, Math.min(80, Math.round(w / tileW)));
  const tiles = thumbs.length
    ? Array.from({ length: n }, (_, k) => {
        if (media?.kind === 'image') return thumbs[0];
        const st = clip.in + ((k + 0.5) / n) * (clip.out - clip.in);
        return thumbs.reduce((best, th) => (Math.abs(th.time - st) < Math.abs(best.time - st) ? th : best), thumbs[0]);
      })
    : [];
  const name = media?.name ?? '?';
  return (
    <div className={`item clip ${selected ? 'selected' : ''} ${offset ? 'dragging' : ''}`}
      style={{ left, width: w, transform: offset ? `translateX(${offset}px)` : undefined }}
      data-item data-id={clip.id} data-kind="clip">
      <button className="item-body" data-item data-id={clip.id} data-kind="clip"
        aria-label={t('track.clip', { name, duration: formatTime(clipDuration(clip)) })} aria-pressed={selected}
        onClick={(e) => { if (e.detail === 0) useEditor.getState().select(clip.id); }}>
        <span className="thumbs" aria-hidden="true">
          {tiles.map((th, k) => <img key={k} src={th.url} alt="" draggable={false} />)}
        </span>
        {(clip.muted || clip.volume === 0) && <span className="badge"><Icon name="muted" size={14} /></span>}
      </button>
      {selected && <Handles id={clip.id} kind="clip" name={name} />}
    </div>
  );
});

function MusicItem({ clip, media, pps, selected }: { clip: MusicClip; media?: MediaInfo; pps: number; selected: boolean }) {
  const w = (clip.out - clip.in) * pps;
  const name = media?.name ?? '?';
  const fadeIn = (clip.fadeIn / (clip.out - clip.in)) * 100;
  const fadeOut = (clip.fadeOut / (clip.out - clip.in)) * 100;
  return (
    <div className={`item music ${selected ? 'selected' : ''}`} style={{ left: clip.start * pps, width: w }}
      data-item data-id={clip.id} data-kind="music">
      <button className="item-body" data-item data-id={clip.id} data-kind="music" aria-pressed={selected}
        aria-label={t('track.clip', { name, duration: formatTime(musicEnd(clip) - clip.start) })}
        onClick={(e) => { if (e.detail === 0) useEditor.getState().select(clip.id); }}>
        <span className="fade" aria-hidden="true"
          style={{ clipPath: `polygon(0 100%, ${fadeIn}% 0, ${100 - fadeOut}% 0, 100% 100%)` }} />
        <span className="item-label">{name}</span>
      </button>
      {selected && <Handles id={clip.id} kind="music" name={name} />}
    </div>
  );
}

function OverlayItem({ o, lane, pps, selected }: { o: Overlay; lane: number; pps: number; selected: boolean }) {
  const label = o.kind === 'text' ? o.text : o.kind === 'emoji' ? o.label : o.sticker;
  return (
    <div className={`item overlay ${selected ? 'selected' : ''}`}
      style={{ left: o.start * pps, width: o.duration * pps, top: 5 + lane * 34 }}
      data-item data-id={o.id} data-kind="overlay">
      <button className="item-body" data-item data-id={o.id} data-kind="overlay" aria-pressed={selected}
        aria-label={t('track.clip', { name: label, duration: formatTime(o.duration) })}
        onClick={(e) => { if (e.detail === 0) useEditor.getState().select(o.id); }}>
        {o.kind === 'emoji' && <img src={`${import.meta.env.BASE_URL}emoji/svg/${o.file}.svg`} alt="" width="20" height="20" draggable={false} />}
        {o.kind === 'sticker' && <img src={`${import.meta.env.BASE_URL}stickers/${o.sticker}.svg`} alt="" height="20" draggable={false} />}
        <span className="item-label">{label}</span>
      </button>
      {selected && <Handles id={o.id} kind="overlay" name={label} />}
    </div>
  );
}
