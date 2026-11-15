// Preview playback. Each video file gets one hidden <video> element (hardware decoding, smooth on
// phones); the active one is drawn into the preview canvas with the overlays on top. Sound runs
// through Web Audio gain nodes because iOS ignores HTMLMediaElement.volume.
import { balanceGains, clipStarts, clipDuration, locate, musicEnvelope, musicEnd, projectDuration } from '../model/time';
import type { MediaInfo, Project } from '../model/types';
import { urlFor } from '../media/library';
import { drawBase, drawOverlays, type VisualSource } from '../render/compose';
import { ensureOverlayAssets } from '../render/assets';
import { loadImage } from '../media/images';

interface ElementEntry {
  el: HTMLMediaElement;
  gain: GainNode | null;
  pendingSeek: number | null;
}

const DRIFT = 0.25;

export class PreviewEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private project: Project | null = null;
  private media: Record<string, MediaInfo> = {};
  private videos = new Map<string, ElementEntry>();
  private audios = new Map<string, ElementEntry>();
  private images = new Map<string, ImageBitmap | HTMLImageElement>();
  private audioCtx: AudioContext | null = null;
  private host: HTMLDivElement;
  private raf = 0;
  private playing = false;
  private wallStart = 0;
  private tStart = 0;
  private time = 0;
  private onTime: (t: number) => void = () => {};
  private onEnded: () => void = () => {};
  private disposed = false;

  constructor() {
    this.host = document.createElement('div');
    this.host.setAttribute('aria-hidden', 'true');
    Object.assign(this.host.style, {
      position: 'fixed', width: '2px', height: '2px', overflow: 'hidden', opacity: '0', pointerEvents: 'none', left: '0', top: '0',
    });
    document.body.appendChild(this.host);
  }

  attach(canvas: HTMLCanvasElement | null) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext('2d', { alpha: false }) ?? null;
    this.draw();
  }

  setCallbacks(onTime: (t: number) => void, onEnded: () => void) {
    this.onTime = onTime;
    this.onEnded = onEnded;
  }

  /** Called whenever the project or media list changes. Creates and removes media elements as needed. */
  async setProject(project: Project, media: Record<string, MediaInfo>) {
    this.project = project;
    this.media = media;
    const videoIds = new Set(project.clips.filter((c) => media[c.mediaId]?.kind === 'video').map((c) => c.mediaId));
    const imageIds = new Set(project.clips.filter((c) => media[c.mediaId]?.kind === 'image').map((c) => c.mediaId));
    const audioIds = new Set(project.music.map((m) => m.mediaId));
    this.prune(this.videos, videoIds);
    this.prune(this.audios, audioIds);
    for (const id of [...this.images.keys()]) if (!imageIds.has(id)) {
      const img = this.images.get(id);
      if (img && 'close' in img) img.close();
      this.images.delete(id);
    }
    const jobs: Promise<unknown>[] = [ensureOverlayAssets(project.overlays)];
    for (const id of videoIds) if (!this.videos.has(id)) jobs.push(this.createElement(id, 'video'));
    for (const id of audioIds) if (!this.audios.has(id)) jobs.push(this.createElement(id, 'audio'));
    for (const id of imageIds) if (!this.images.has(id) && media[id]) {
      jobs.push(loadImage(media[id]).then((img) => { if (!this.disposed) this.images.set(id, img); }).catch(() => null));
    }
    this.draw();
    await Promise.all(jobs);
    if (!this.playing) this.seek(this.time);
  }

  private prune(map: Map<string, ElementEntry>, keep: Set<string>) {
    for (const [id, entry] of map) {
      if (keep.has(id)) continue;
      entry.el.pause();
      entry.el.removeAttribute('src');
      entry.el.load();
      entry.el.remove();
      entry.gain?.disconnect();
      map.delete(id);
    }
  }

  private async createElement(id: string, tag: 'video' | 'audio') {
    const map = tag === 'video' ? this.videos : this.audios;
    const m = this.media[id];
    if (!m) return;
    const el = document.createElement(tag);
    el.preload = 'auto';
    el.muted = !this.audioCtx;
    if (el instanceof HTMLVideoElement) {
      el.playsInline = true;
      el.setAttribute('playsinline', '');
      el.disablePictureInPicture = true;
    }
    const entry: ElementEntry = { el, gain: null, pendingSeek: null };
    map.set(id, entry);
    el.addEventListener('seeked', () => {
      if (entry.pendingSeek !== null) {
        const next = entry.pendingSeek;
        entry.pendingSeek = null;
        el.currentTime = next;
      } else if (!this.playing) this.draw();
    });
    el.addEventListener('loadeddata', () => { if (!this.playing) this.draw(); });
    this.host.appendChild(el);
    el.src = await urlFor(m);
    if (this.audioCtx) this.connect(entry);
  }

  private connect(entry: ElementEntry) {
    if (!this.audioCtx || entry.gain) return;
    try {
      const src = this.audioCtx.createMediaElementSource(entry.el);
      entry.gain = this.audioCtx.createGain();
      entry.gain.gain.value = 0;
      src.connect(entry.gain).connect(this.audioCtx.destination);
      entry.el.muted = false;
    } catch {
      entry.el.muted = false;
    }
  }

  /** Must be called from a user gesture the first time (autoplay rules). */
  private unlockAudio() {
    if (!this.audioCtx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.audioCtx = new Ctor();
      for (const e of [...this.videos.values(), ...this.audios.values()]) this.connect(e);
    }
    if (this.audioCtx.state !== 'running') void this.audioCtx.resume();
  }

  get currentTime() {
    return this.time;
  }

  get isPlaying() {
    return this.playing;
  }

  play() {
    if (!this.project) return;
    this.unlockAudio();
    const dur = projectDuration(this.project);
    if (dur <= 0) return;
    if (this.time >= dur - 0.05) this.time = 0;
    this.playing = true;
    this.tStart = this.time;
    this.wallStart = performance.now();
    cancelAnimationFrame(this.raf);
    const tick = () => {
      if (!this.playing) return;
      this.step();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    for (const e of [...this.videos.values(), ...this.audios.values()]) {
      e.el.pause();
      if (e.gain && this.audioCtx) e.gain.gain.setValueAtTime(0, this.audioCtx.currentTime);
    }
  }

  /** Paused scrub: seek the right element and redraw once the frame is there. */
  seek(t: number) {
    this.time = t;
    if (this.playing) {
      this.tStart = t;
      this.wallStart = performance.now();
      this.syncElements(t, true);
      return;
    }
    if (!this.project) return;
    const loc = locate(this.project.clips, t);
    if (loc) {
      const entry = this.videos.get(loc.clip.mediaId);
      if (entry) this.seekElement(entry, loc.sourceTime);
    }
    this.draw();
  }

  private seekElement(entry: ElementEntry, target: number) {
    const el = entry.el;
    if (Math.abs(el.currentTime - target) < 0.02 && !el.seeking) return;
    if (el.seeking) entry.pendingSeek = target;
    else el.currentTime = target;
  }

  private step() {
    const p = this.project!;
    const dur = projectDuration(p);
    let t = this.tStart + (performance.now() - this.wallStart) / 1000;
    // Follow the active video element's clock when it is running: that keeps picture and sound smooth.
    const loc0 = locate(p.clips, this.time);
    if (loc0) {
      const e = this.videos.get(loc0.clip.mediaId);
      if (e && !e.el.paused && !e.el.seeking && e.el.readyState >= 3) {
        const fromEl = loc0.start + (e.el.currentTime - loc0.clip.in) / (loc0.clip.speed || 1);
        if (Math.abs(fromEl - t) < 1) {
          t = fromEl;
          this.tStart = t;
          this.wallStart = performance.now();
        }
      }
    }
    if (t >= dur) {
      this.time = dur;
      this.pause();
      this.draw();
      this.onTime(dur);
      this.onEnded();
      return;
    }
    this.time = t;
    this.syncElements(t, false);
    this.draw();
    this.onTime(t);
  }

  private syncElements(t: number, hard: boolean) {
    const p = this.project!;
    const gains = balanceGains(p.balance);
    const loc = locate(p.clips, t);
    const now = this.audioCtx?.currentTime ?? 0;
    const starts = clipStarts(p.clips);
    for (const [id, e] of this.videos) {
      const active = loc && loc.clip.mediaId === id;
      if (active) {
        const target = loc.sourceTime;
        if (hard || Math.abs(e.el.currentTime - target) > DRIFT) this.seekElement(e, target);
        if (e.el.paused) void e.el.play().catch(() => null);
        const g = loc.clip.muted ? 0 : loc.clip.volume * gains.original;
        e.gain?.gain.setTargetAtTime(g, now, 0.015);
      } else {
        if (!e.el.paused) e.el.pause();
        e.gain?.gain.setTargetAtTime(0, now, 0.015);
        // Pre-roll: park the next clip's element on its first frame shortly before it is needed.
        if (loc) {
          const next = p.clips[loc.index + 1];
          const endOfCurrent = starts[loc.index] + clipDuration(loc.clip);
          if (next && next.mediaId === id && endOfCurrent - t < 0.8 && !e.el.seeking && Math.abs(e.el.currentTime - next.in) > 0.05) {
            e.el.currentTime = next.in;
          }
        }
      }
    }
    for (const [id, e] of this.audios) {
      const m = p.music.find((x) => x.mediaId === id && t >= x.start && t < musicEnd(x));
      if (m) {
        const target = m.in + (t - m.start);
        if (hard || Math.abs(e.el.currentTime - target) > DRIFT) this.seekElement(e, target);
        if (e.el.paused) void e.el.play().catch(() => null);
        e.gain?.gain.setTargetAtTime(m.volume * gains.music * musicEnvelope(m, t), now, 0.03);
      } else {
        if (!e.el.paused) e.el.pause();
        e.gain?.gain.setTargetAtTime(0, now, 0.03);
      }
    }
  }

  draw() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    const p = this.project;
    if (!ctx || !canvas || !p) return;
    const W = canvas.width;
    const H = canvas.height;
    const loc = locate(p.clips, this.time);
    let src: VisualSource | null = null;
    if (loc) {
      const m = this.media[loc.clip.mediaId];
      if (m?.kind === 'video') {
        const el = this.videos.get(m.id)?.el as HTMLVideoElement | undefined;
        if (el && el.readyState >= 2 && el.videoWidth > 0) {
          src = { width: el.videoWidth, height: el.videoHeight, draw: (c, x, y, w, h) => c.drawImage(el, x, y, w, h) };
        }
      } else if (m?.kind === 'image') {
        const img = this.images.get(m.id);
        if (img) {
          const w = 'naturalWidth' in img ? img.naturalWidth : img.width;
          const h = 'naturalHeight' in img ? img.naturalHeight : img.height;
          src = { width: w, height: h, draw: (c, x, y, dw, dh) => c.drawImage(img, x, y, dw, dh) };
        }
      }
    }
    drawBase(ctx, W, H, src, loc?.clip.fit ?? 'contain');
    drawOverlays(ctx, W, H, p.overlays, this.time);
  }

  /** Short audition of a music file in the picker. */
  previewAudio(url: string | null) {
    let e = this.audition;
    if (!url) {
      e?.el.pause();
      return;
    }
    this.unlockAudio();
    if (!e) {
      const el = new Audio();
      el.preload = 'auto';
      e = { el, gain: null, pendingSeek: null };
      this.host.appendChild(el);
    }
    e.el.src = url;
    void e.el.play().catch(() => null);
    this.audition = e;
  }
  private audition: ElementEntry | null = null;
  stopAudition() {
    this.audition?.el.pause();
  }

  dispose() {
    this.disposed = true;
    this.pause();
    this.prune(this.videos, new Set());
    this.prune(this.audios, new Set());
    this.host.remove();
    void this.audioCtx?.close();
  }
}

export const engine = typeof document !== 'undefined' ? new PreviewEngine() : (null as unknown as PreviewEngine);
