// Mixes the project's sound in fixed windows with OfflineAudioContext, so even a long project never
// holds more than one window of decoded audio in memory.
import { balanceGains, clipStarts, clipDuration, musicEnd, musicEnvelope } from '../model/time';
import type { Project } from '../model/types';
import type { AudioReader } from './sources';

export const SAMPLE_RATE = 48000;
export const MIX_WINDOW = 10;

type Readers = Map<string, AudioReader>;

async function schedule(
  ctx: OfflineAudioContext, reader: AudioReader, dest: AudioNode,
  timelineStart: number, srcIn: number, srcFrom: number, srcTo: number, w0: number,
) {
  for await (const chunk of reader.read(srcFrom, srcTo)) {
    const chunkEnd = chunk.time + chunk.buffer.duration;
    const a = Math.max(chunk.time, srcFrom);
    const b = Math.min(chunkEnd, srcTo);
    if (b <= a) continue;
    const node = ctx.createBufferSource();
    node.buffer = chunk.buffer;
    node.connect(dest);
    const when = timelineStart + (a - srcIn) - w0;
    node.start(Math.max(0, when), a - chunk.time + Math.max(0, -when), b - a);
  }
}

export async function mixWindow(p: Project, w0: number, w1: number, videoReaders: Readers, musicReaders: Readers): Promise<AudioBuffer> {
  const length = Math.max(1, Math.round((w1 - w0) * SAMPLE_RATE));
  const ctx = new OfflineAudioContext(2, length, SAMPLE_RATE);
  const gains = balanceGains(p.balance);
  const starts = clipStarts(p.clips);

  for (let i = 0; i < p.clips.length; i++) {
    const c = p.clips[i];
    const reader = videoReaders.get(c.mediaId);
    const level = c.muted ? 0 : c.volume * gains.original;
    if (!reader || level <= 0) continue;
    const cs = starts[i];
    const ce = cs + clipDuration(c);
    const a = Math.max(w0, cs);
    const b = Math.min(w1, ce);
    if (b <= a) continue;
    const g = ctx.createGain();
    g.gain.value = level;
    g.connect(ctx.destination);
    await schedule(ctx, reader, g, cs, c.in, c.in + (a - cs), c.in + (b - cs), w0);
  }

  for (const m of p.music) {
    const reader = musicReaders.get(m.mediaId);
    const level = m.volume * gains.music;
    if (!reader || level <= 0) continue;
    const me = musicEnd(m);
    const a = Math.max(w0, m.start);
    const b = Math.min(w1, me);
    if (b <= a) continue;
    const g = ctx.createGain();
    // The fade envelope is piecewise linear between these points, so linear ramps reproduce it exactly.
    const keys = [a, b, m.start + m.fadeIn, me - m.fadeOut].filter((k) => k >= a && k <= b).sort((x, y) => x - y);
    g.gain.setValueAtTime(level * musicEnvelope(m, a), 0);
    for (const k of keys) g.gain.linearRampToValueAtTime(level * musicEnvelope(m, Math.min(k, me - 1e-6)), k - w0);
    g.connect(ctx.destination);
    await schedule(ctx, reader, g, m.start, m.in, m.in + (a - m.start), m.in + (b - m.start), w0);
  }

  return ctx.startRendering();
}

/** Interleaved 16-bit PCM WAV, used by the ffmpeg fallback. */
export function encodeWav(buffers: AudioBuffer[]): Uint8Array {
  const frames = buffers.reduce((s, b) => s + b.length, 0);
  const out = new DataView(new ArrayBuffer(44 + frames * 4));
  const str = (o: number, s: string) => [...s].forEach((ch, i) => out.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  out.setUint32(4, 36 + frames * 4, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 2, true);
  out.setUint32(24, SAMPLE_RATE, true);
  out.setUint32(28, SAMPLE_RATE * 4, true);
  out.setUint16(32, 4, true);
  out.setUint16(34, 16, true);
  str(36, 'data');
  out.setUint32(40, frames * 4, true);
  let o = 44;
  for (const b of buffers) {
    const l = b.getChannelData(0);
    const r = b.numberOfChannels > 1 ? b.getChannelData(1) : l;
    for (let i = 0; i < b.length; i++) {
      out.setInt16(o, Math.max(-1, Math.min(1, l[i])) * 0x7fff, true);
      out.setInt16(o + 2, Math.max(-1, Math.min(1, r[i])) * 0x7fff, true);
      o += 4;
    }
  }
  return new Uint8Array(out.buffer);
}
