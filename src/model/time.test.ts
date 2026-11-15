import { describe, expect, it } from 'vitest';
import {
  balanceGains, clipStarts, fitRect, formatTime, locate, musicEnvelope, outputSize, projectDuration, videoTrackDuration,
} from './time';
import { emptyProject, type MusicClip, type VideoClip } from './types';

const clip = (id: string, i: number, o: number): VideoClip =>
  ({ id, mediaId: 'm', in: i, out: o, speed: 1, volume: 1, muted: false, fit: 'contain' });

describe('time math', () => {
  const clips = [clip('a', 0, 2), clip('b', 5, 8), clip('c', 1, 1.5)];

  it('lays clips back to back', () => {
    expect(clipStarts(clips)).toEqual([0, 2, 5]);
    expect(videoTrackDuration(clips)).toBe(5.5);
  });

  it('locates the clip and source time under the playhead', () => {
    expect(locate(clips, 0)).toMatchObject({ index: 0, sourceTime: 0 });
    expect(locate(clips, 1.999)).toMatchObject({ index: 0 });
    expect(locate(clips, 2)).toMatchObject({ index: 1, sourceTime: 5 });
    expect(locate(clips, 3.5)).toMatchObject({ index: 1, sourceTime: 6.5 });
    expect(locate(clips, 5.5)).toMatchObject({ index: 2, sourceTime: 1.5 });
    expect(locate(clips, 6)).toBeNull();
    expect(locate([], 0)).toBeNull();
  });

  it('uses the video track for project duration, else overlays and music', () => {
    const p = emptyProject();
    expect(projectDuration(p)).toBe(0);
    p.overlays.push({ id: 'o', kind: 'emoji', file: 'x', label: '', start: 1, duration: 3, x: 0.5, y: 0.5, scale: 0.2, rotation: 0 });
    expect(projectDuration(p)).toBe(4);
    p.clips = clips;
    expect(projectDuration(p)).toBe(5.5);
  });

  it('balances original audio against music', () => {
    expect(balanceGains(0.5)).toEqual({ original: 1, music: 1 });
    expect(balanceGains(0)).toEqual({ original: 1, music: 0 });
    expect(balanceGains(1)).toEqual({ original: 0, music: 1 });
    expect(balanceGains(0.75)).toEqual({ original: 0.5, music: 1 });
    expect(balanceGains(7)).toEqual({ original: 0, music: 1 });
  });

  it('computes music fades', () => {
    const m: MusicClip = { id: 'm', mediaId: 'x', start: 10, in: 0, out: 10, volume: 1, fadeIn: 2, fadeOut: 4 };
    expect(musicEnvelope(m, 9)).toBe(0);
    expect(musicEnvelope(m, 10)).toBe(0);
    expect(musicEnvelope(m, 11)).toBe(0.5);
    expect(musicEnvelope(m, 14)).toBe(1);
    expect(musicEnvelope(m, 18)).toBe(0.5);
    expect(musicEnvelope(m, 20)).toBe(0);
    expect(musicEnvelope(m, 21)).toBe(0);
  });

  it('sizes output frames with even dimensions', () => {
    expect(outputSize('16:9', 1080)).toEqual({ width: 1920, height: 1080 });
    expect(outputSize('9:16', 1080)).toEqual({ width: 1080, height: 1920 });
    expect(outputSize('1:1', 720)).toEqual({ width: 720, height: 720 });
    expect(outputSize('16:9', 720)).toEqual({ width: 1280, height: 720 });
  });

  it('fits and fills', () => {
    expect(fitRect(1920, 1080, 1080, 1920, 'contain')).toEqual({ x: 0, y: 656.25, w: 1080, h: 607.5 });
    const fill = fitRect(1920, 1080, 1080, 1920, 'cover');
    expect(fill.h).toBe(1920);
    expect(fill.x).toBeCloseTo(-1166.67, 1);
  });

  it('formats times', () => {
    expect(formatTime(0)).toBe('0:00.0');
    expect(formatTime(75.25)).toBe('1:15.2');
    expect(formatTime(600, false)).toBe('10:00');
  });
});
