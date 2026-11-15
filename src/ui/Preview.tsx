import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useEditor, useProject, getProject } from '../state/store';
import { engine } from '../preview/engine';
import { aspectValue, clamp } from '../model/time';
import { updateOverlay } from '../model/timeline';
import { hitOverlay, isOverlayVisible, overlayBox } from '../render/compose';
import type { Overlay } from '../model/types';
import { t } from '../i18n/strings';
import { Icon } from './icons';
import { importToTimeline } from './TopBar';
import { pausePlayback } from './App';
import { overlayName, removeOverlay } from './Inspector';

/** Longest side of the preview canvas in pixels; enough for a sharp phone preview, cheap to draw. */
const PREVIEW_MAX = 1280;

interface Gesture {
  id: string;
  mode: 'move' | 'transform';
  pointers: Map<number, { x: number; y: number }>;
  start: { x: number; y: number; scale: number; rotation: number };
  /** For two-finger and handle gestures: initial distance and angle. */
  dist: number;
  angle: number;
  origin: { x: number; y: number };
}

export function Preview() {
  const project = useProject();
  const selection = useEditor((s) => s.selection);
  const time = useEditor((s) => s.time);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const gesture = useRef<Gesture | null>(null);
  const aspect = aspectValue(project.aspect);

  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => {
      const cs = getComputedStyle(el);
      const availW = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const availH = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const w = Math.max(0, Math.min(availW, availH * aspect));
      setBox({ w: Math.floor(w), h: Math.floor(w / aspect) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || box.w === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.min(dpr, PREVIEW_MAX / Math.max(box.w, box.h));
    c.width = Math.max(2, Math.round(box.w * scale));
    c.height = Math.max(2, Math.round(box.h * scale));
    engine.attach(c);
    return () => engine.attach(null);
  }, [box.w, box.h]);

  useEffect(() => {
    if (!engine.isPlaying) engine.draw();
  }, [project, time]);

  const selected = project.overlays.find((o) => o.id === selection) ?? null;
  const showHandles = selected && isOverlayVisible(selected, time);

  const toFrame = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // The delete button handles its own click; don't start a move under it.
    if ((e.target as HTMLElement).closest('[data-handle="delete"]')) return;
    const pt = toFrame(e);
    const g = gesture.current;
    if (g) {
      // Second finger: switch to pinch / rotate.
      g.pointers.set(e.pointerId, pt);
      (e.target as Element).setPointerCapture?.(e.pointerId);
      if (g.pointers.size === 2) startTransform(g, null);
      return;
    }
    const s = useEditor.getState();
    const p = getProject();
    const isHandle = (e.target as HTMLElement).dataset.handle === 'transform';
    const target: Overlay | null = isHandle && selected ? selected : hitOverlay(p.overlays, s.time, pt.x, pt.y, box.w, box.h, canvasRef.current?.getContext('2d'));
    if (!target) {
      if (p.overlays.some((o) => o.id === s.selection)) s.select(null);
      return;
    }
    pausePlayback();
    s.select(target.id);
    s.begin();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const ng: Gesture = {
      id: target.id, mode: 'move', pointers: new Map([[e.pointerId, pt]]),
      start: { x: target.x, y: target.y, scale: target.scale, rotation: target.rotation }, dist: 1, angle: 0, origin: pt,
    };
    gesture.current = ng;
    if (isHandle) startTransform(ng, pt);
  };

  /** Two pointers, or the corner handle: scale by distance change and rotate by angle change around the centre. */
  const startTransform = (g: Gesture, handlePt: { x: number; y: number } | null) => {
    const o = getProject().overlays.find((x) => x.id === g.id);
    if (!o) return;
    g.mode = 'transform';
    g.start = { x: o.x, y: o.y, scale: o.scale, rotation: o.rotation };
    const [a, b] = handlePt ? [{ x: o.x * box.w, y: o.y * box.h }, handlePt] : [...g.pointers.values()];
    g.dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    g.angle = Math.atan2(b.y - a.y, b.x - a.x);
    g.origin = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || !g.pointers.has(e.pointerId)) return;
    const pt = toFrame(e);
    g.pointers.set(e.pointerId, pt);
    const s = useEditor.getState();
    let patch: Partial<Overlay>;
    if (g.mode === 'move') {
      patch = {
        x: clamp(g.start.x + (pt.x - g.origin.x) / box.w, 0, 1),
        y: clamp(g.start.y + (pt.y - g.origin.y) / box.h, 0, 1),
      };
    } else {
      const pts = [...g.pointers.values()];
      const two = pts.length >= 2;
      const a = two ? pts[0] : { x: g.start.x * box.w, y: g.start.y * box.h };
      const b = two ? pts[1] : pt;
      const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      patch = { scale: clamp(g.start.scale * (dist / g.dist), 0.03, 3), rotation: g.start.rotation + (angle - g.angle) };
      if (two) {
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        patch.x = clamp(g.start.x + (mid.x - g.origin.x) / box.w, 0, 1);
        patch.y = clamp(g.start.y + (mid.y - g.origin.y) / box.h, 0, 1);
      }
    }
    s.apply((p) => updateOverlay(p, g.id, patch));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    g.pointers.delete(e.pointerId);
    if (g.pointers.size === 0) {
      gesture.current = null;
      useEditor.getState().end();
    } else if (g.pointers.size === 1) {
      // Back to one finger: continue as a move from here.
      const [pt] = g.pointers.values();
      const o = getProject().overlays.find((x) => x.id === g.id);
      if (o) Object.assign(g, { mode: 'move', origin: pt, start: { x: o.x, y: o.y, scale: o.scale, rotation: o.rotation } });
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!selected || !showHandles) return;
    const s = useEditor.getState();
    const f = Math.exp(-e.deltaY / 500);
    s.apply((p) => updateOverlay(p, selected.id, { scale: clamp(selected.scale * f, 0.03, 3) }));
  };

  const empty = project.clips.length === 0 && project.overlays.length === 0;
  let handleBox: { cx: number; cy: number; w: number; h: number } | null = null;
  if (showHandles && selected) handleBox = overlayBox(selected, box.w, box.h, canvasRef.current?.getContext('2d'));

  return (
    <div className="preview-wrap" ref={wrapRef}>
      <div className="preview" style={{ width: box.w, height: box.h }}>
        <canvas ref={canvasRef} className="preview-canvas" style={{ width: box.w, height: box.h }}
          role="img" aria-label={t('app.name')} />
        <div className="gesture-layer" onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel} data-testid="preview-gestures">
          {handleBox && selected && (
            <div className="overlay-frame" style={{
              left: handleBox.cx, top: handleBox.cy, width: handleBox.w, height: handleBox.h,
              transform: `translate(-50%, -50%) rotate(${selected.rotation}rad)`,
            }}>
              <span className="overlay-handle" data-handle="transform" aria-hidden="true" />
              <button className="overlay-delete" data-handle="delete" data-testid="overlay-delete"
                aria-label={t('inspect.removeNamed', { name: overlayName(selected) })} title={t('inspect.remove')}
                style={{ transform: `rotate(${-selected.rotation}rad)` }}
                onClick={() => removeOverlay(selected.id)}>
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
        </div>
        {empty && (
          <div className="empty-state">
            <h1>{t('empty.title')}</h1>
            <p>{t('empty.body')}</p>
            <button className="btn primary big" onClick={() => void importToTimeline()}>
              <Icon name="import" />
              {t('empty.button')}
            </button>
            <p className="privacy-note">
              <Icon name="lock" size={16} /> {t('app.privacy')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
