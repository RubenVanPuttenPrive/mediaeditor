import { useId } from 'react';
import { useEditor, useProject } from '../state/store';
import { updateClip, updateMusic, updateOverlay } from '../model/timeline';
import { clamp, MIN_CLIP } from '../model/time';
import type { MusicClip, Overlay, TextOverlay, VideoClip } from '../model/types';
import { FONTS } from '../render/assets';
import { t } from '../i18n/strings';
import { Icon } from './icons';

export const TEXT_COLORS = ['#ffffff', '#111111', '#ffd34e', '#ff7a8a', '#3cc9b4', '#a08bff', '#4ea8ff', '#ff9f1c'];

/** Range slider whose drag becomes a single undo step. */
export function Slider(props: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string;
}) {
  const id = useId();
  const s = useEditor.getState();
  return (
    <div className="field">
      <label htmlFor={id}>
        <span>{props.label}</span>
        <output htmlFor={id}>{props.format ? props.format(props.value) : props.value}</output>
      </label>
      <input id={id} type="range" min={props.min} max={props.max} step={props.step} value={props.value}
        onPointerDown={() => s.begin()} onPointerUp={() => s.end()} onPointerCancel={() => s.end()} onBlur={() => s.end()}
        onChange={(e) => props.onChange(Number(e.target.value))} />
    </div>
  );
}

function NumberField(props: { label: string; value: number; min: number; max?: number; step?: number; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div className="field inline">
      <label htmlFor={id}>{props.label}</label>
      <div className="number-wrap">
        <input id={id} type="number" inputMode="decimal" min={props.min} max={props.max} step={props.step ?? 0.1}
          value={Number(props.value.toFixed(2))}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) props.onChange(clamp(v, props.min, props.max ?? Infinity));
          }} />
        <span className="unit">s</span>
      </div>
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const secs = (v: number) => t('inspect.seconds', { value: v.toFixed(1) });

export function BalanceSlider() {
  const balance = useProject().balance;
  const s = useEditor.getState();
  return (
    <Slider label={t('inspect.balance')} value={balance} min={0} max={1} step={0.01}
      format={(v) => `${t('inspect.balanceOriginal')} ${Math.round(Math.min(1, 2 * (1 - v)) * 100)}% · ${t('inspect.balanceMusic')} ${Math.round(Math.min(1, 2 * v) * 100)}%`}
      onChange={(v) => s.apply((p) => ({ ...p, balance: v }))} />
  );
}

function ClipInspector({ clip }: { clip: VideoClip }) {
  const media = useEditor((s) => s.media[clip.mediaId]);
  const hasMusic = useProject().music.length > 0;
  const s = useEditor.getState();
  const set = (patch: Partial<VideoClip>) => s.apply((p) => updateClip(p, clip.id, patch));
  return (
    <>
      <h2 className="inspector-title">{media?.name ?? t('inspect.clip')}</h2>
      <div className="inspector-grid">
        {media?.kind !== 'image' && (
          <>
            <Slider label={t('inspect.volume')} value={clip.volume} min={0} max={2} step={0.01} format={pct}
              onChange={(v) => set({ volume: v, muted: false })} />
            <label className="check">
              <input type="checkbox" checked={clip.muted} onChange={(e) => set({ muted: e.target.checked })} />
              <span>{t('inspect.mute')}</span>
            </label>
          </>
        )}
        {media?.kind === 'image' && (
          <NumberField label={t('inspect.duration')} value={clip.out - clip.in} min={MIN_CLIP} max={600}
            onChange={(v) => set({ out: clip.in + v })} />
        )}
        <div className="field">
          <span className="field-label" id={`fit-${clip.id}`}>{t('inspect.fit')}</span>
          <div className="segmented" role="radiogroup" aria-labelledby={`fit-${clip.id}`}>
            {(['contain', 'cover'] as const).map((f) => (
              <button key={f} role="radio" aria-checked={clip.fit === f} className={clip.fit === f ? 'on' : ''} onClick={() => set({ fit: f })}>
                {f === 'contain' ? t('inspect.fitContain') : t('inspect.fitCover')}
              </button>
            ))}
          </div>
        </div>
        {hasMusic && <BalanceSlider />}
      </div>
    </>
  );
}

function MusicInspector({ clip }: { clip: MusicClip }) {
  const media = useEditor((s) => s.media[clip.mediaId]);
  const s = useEditor.getState();
  const set = (patch: Partial<MusicClip>) => s.apply((p) => updateMusic(p, clip.id, patch));
  const len = clip.out - clip.in;
  const maxFade = Math.min(10, len / 2);
  return (
    <>
      <h2 className="inspector-title music">{media?.name ?? t('inspect.music')}</h2>
      <div className="inspector-grid">
        <Slider label={t('inspect.volume')} value={clip.volume} min={0} max={2} step={0.01} format={pct} onChange={(v) => set({ volume: v })} />
        <BalanceSlider />
        <Slider label={t('inspect.fadeIn')} value={Math.min(clip.fadeIn, maxFade)} min={0} max={maxFade} step={0.1} format={secs} onChange={(v) => set({ fadeIn: v })} />
        <Slider label={t('inspect.fadeOut')} value={Math.min(clip.fadeOut, maxFade)} min={0} max={maxFade} step={0.1} format={secs} onChange={(v) => set({ fadeOut: v })} />
        <NumberField label={t('inspect.start')} value={clip.start} min={0} onChange={(v) => set({ start: v })} />
        <NumberField label={t('inspect.trimIn')} value={clip.in} min={0} max={clip.out - MIN_CLIP} onChange={(v) => set({ in: v })} />
        <NumberField label={t('inspect.trimOut')} value={clip.out} min={clip.in + MIN_CLIP} max={media?.duration ?? clip.out} onChange={(v) => set({ out: v })} />
      </div>
    </>
  );
}

export function TextStyleFields({ o, onChange }: { o: Pick<TextOverlay, 'font' | 'color' | 'outline' | 'shadow'>; onChange: (p: Partial<TextOverlay>) => void }) {
  return (
    <>
      <div className="field wide">
        <span className="field-label" id="font-label">{t('inspect.font')}</span>
        <div className="font-row" role="radiogroup" aria-labelledby="font-label">
          {FONTS.map((f) => (
            <button key={f.id} role="radio" aria-checked={o.font === f.id} className={`font-chip ${o.font === f.id ? 'on' : ''}`}
              style={{ fontFamily: `"${f.id}"`, fontWeight: f.weight }} onClick={() => onChange({ font: f.id })}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="field wide">
        <span className="field-label" id="color-label">{t('inspect.color')}</span>
        <div className="swatches" role="radiogroup" aria-labelledby="color-label">
          {TEXT_COLORS.map((c) => (
            <button key={c} role="radio" aria-checked={o.color === c} aria-label={c} className={`swatch ${o.color === c ? 'on' : ''}`}
              style={{ background: c }} onClick={() => onChange({ color: c })} />
          ))}
          <input type="color" aria-label={t('inspect.color')} value={o.color} onChange={(e) => onChange({ color: e.target.value })} />
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={o.outline} onChange={(e) => onChange({ outline: e.target.checked })} />
        <span>{t('inspect.outline')}</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={o.shadow} onChange={(e) => onChange({ shadow: e.target.checked })} />
        <span>{t('inspect.shadow')}</span>
      </label>
    </>
  );
}

function OverlayInspector({ o }: { o: Overlay }) {
  const s = useEditor.getState();
  const set = (patch: Partial<Overlay>) => s.apply((p) => updateOverlay(p, o.id, patch));
  const deg = Math.round(((((o.rotation * 180) / Math.PI) % 360) + 540) % 360 - 180);
  return (
    <>
      <h2 className="inspector-title overlay">{o.kind === 'text' ? t('inspect.text') : o.kind === 'emoji' ? o.label : t('inspect.overlay')}</h2>
      <div className="inspector-grid">
        {o.kind === 'text' && (
          <div className="field wide">
            <label htmlFor={`txt-${o.id}`}>{t('inspect.text')}</label>
            <textarea id={`txt-${o.id}`} rows={2} value={o.text} onFocus={() => s.begin()} onBlur={() => s.end()}
              onChange={(e) => set({ text: e.target.value } as Partial<Overlay>)} />
          </div>
        )}
        <Slider label={t('inspect.size')} value={o.scale} min={0.03} max={2} step={0.01} format={pct} onChange={(v) => set({ scale: v })} />
        <Slider label={t('inspect.rotation')} value={deg} min={-180} max={180} step={1} format={(v) => `${v}°`}
          onChange={(v) => set({ rotation: (v * Math.PI) / 180 })} />
        <NumberField label={t('inspect.start')} value={o.start} min={0} onChange={(v) => set({ start: v })} />
        <NumberField label={t('inspect.duration')} value={o.duration} min={MIN_CLIP} onChange={(v) => set({ duration: v })} />
        <button className="btn" onClick={() => set({ x: 0.5, y: 0.5 })}>{t('inspect.center')}</button>
        {o.kind === 'text' && <TextStyleFields o={o} onChange={(p) => set(p as Partial<Overlay>)} />}
      </div>
    </>
  );
}

export function Inspector() {
  const project = useProject();
  const selection = useEditor((s) => s.selection);
  const clip = project.clips.find((c) => c.id === selection);
  const music = project.music.find((m) => m.id === selection);
  const overlay = project.overlays.find((o) => o.id === selection);
  if (!clip && !music && !overlay) {
    if (project.music.length === 0) return null;
    return (
      <aside className="inspector compact" aria-label={t('inspect.balance')}>
        <BalanceSlider />
      </aside>
    );
  }
  return (
    <aside className="inspector" aria-label={t('inspect.clip')}>
      <button className="icon-btn small inspector-close" onClick={() => useEditor.getState().select(null)} aria-label={t('inspect.close')}>
        <Icon name="close" size={18} />
      </button>
      {clip && <ClipInspector clip={clip} />}
      {music && <MusicInspector clip={music} />}
      {overlay && <OverlayInspector o={overlay} />}
    </aside>
  );
}
