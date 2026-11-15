import { describe, expect, it } from 'vitest';
import {
  addClips, addMusic, dropIndex, moveClip, removeItem, splitClipAt, splitMusicAt, trimClip, trimMusic, updateClip,
} from './timeline';
import { projectDuration } from './time';
import { emptyProject, type MusicClip, type Project, type VideoClip } from './types';

const clip = (id: string, i: number, o: number): VideoClip =>
  ({ id, mediaId: 'm', in: i, out: o, speed: 1, volume: 1, muted: false, fit: 'contain' });

const base = (): Project => addClips(emptyProject(), [clip('a', 0, 4), clip('b', 0, 6)]);

describe('timeline operations', () => {
  it('splits the clip under the playhead without changing total length', () => {
    const p = base();
    const { project, newId } = splitClipAt(p, 5);
    expect(newId).toBeTruthy();
    expect(project.clips.map((c) => [c.in, c.out])).toEqual([[0, 4], [0, 1], [1, 6]]);
    expect(projectDuration(project)).toBe(projectDuration(p));
    expect(p.clips).toHaveLength(2); // input untouched
  });

  it('refuses splits that would create a sliver', () => {
    expect(splitClipAt(base(), 4.05).newId).toBeNull();
    expect(splitClipAt(base(), 4).newId).toBeNull();
    expect(splitClipAt(base(), 50).newId).toBeNull();
  });

  it('trims within the source and keeps a minimum length', () => {
    let p = trimClip(base(), 'a', 'in', 1.5, 4);
    expect(p.clips[0]).toMatchObject({ in: 1.5, out: 4 });
    p = trimClip(p, 'a', 'out', 99, 4);
    expect(p.clips[0].out).toBe(4);
    p = trimClip(p, 'a', 'in', 3.99, 4);
    expect(p.clips[0].in).toBeCloseTo(3.9);
    p = trimClip(p, 'a', 'in', -2, 4);
    expect(p.clips[0].in).toBe(0);
  });

  it('reorders by drag', () => {
    const p = addClips(base(), [clip('c', 0, 1)]);
    expect(moveClip(p, 0, 2).clips.map((c) => c.id)).toEqual(['b', 'c', 'a']);
    expect(moveClip(p, 2, 0).clips.map((c) => c.id)).toEqual(['c', 'a', 'b']);
    expect(dropIndex(p.clips, 0, 9.5)).toBe(1); // a(0-4) b(4-10) c(10-11): past b's middle (7)
    expect(dropIndex(p.clips, 0, 10.8)).toBe(2);
    expect(dropIndex(p.clips, 2, 0.1)).toBe(0);
  });

  it('removes items of any track and updates clips', () => {
    const m: MusicClip = { id: 'm1', mediaId: 'x', start: 0, in: 0, out: 30, volume: 1, fadeIn: 0, fadeOut: 0 };
    let p = addMusic(base(), m);
    p = removeItem(p, 'a');
    expect(p.clips.map((c) => c.id)).toEqual(['b']);
    p = removeItem(p, 'm1');
    expect(p.music).toHaveLength(0);
    expect(removeItem(p, 'nope')).toBe(p);
    expect(updateClip(p, 'b', { muted: true }).clips[0].muted).toBe(true);
  });

  it('trims and splits music, keeping the right edge fixed on left trims', () => {
    const m: MusicClip = { id: 'm1', mediaId: 'x', start: 2, in: 0, out: 30, volume: 1, fadeIn: 1, fadeOut: 3 };
    let p = addMusic(emptyProject(), m);
    p = trimMusic(p, 'm1', 'in', 5, 30);
    expect(p.music[0]).toMatchObject({ in: 5, start: 7, out: 30 });
    const s = splitMusicAt(p, 'm1', 17);
    expect(s.project.music.map((x) => [x.start, x.in, x.out])).toEqual([[7, 5, 15], [17, 15, 30]]);
    expect(s.project.music[0].fadeOut).toBe(0);
    expect(s.project.music[1].fadeIn).toBe(0);
  });
});
