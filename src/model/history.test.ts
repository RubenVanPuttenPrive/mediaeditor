import { describe, expect, it } from 'vitest';
import { begin, canRedo, canUndo, createHistory, end, push, redo, undo, update } from './history';

describe('history', () => {
  it('undoes and redoes edits', () => {
    let h = createHistory(0);
    h = push(h, 1);
    h = push(h, 2);
    expect(canUndo(h)).toBe(true);
    h = undo(h);
    expect(h.present).toBe(1);
    h = undo(h);
    expect(h.present).toBe(0);
    expect(canUndo(h)).toBe(false);
    h = undo(h);
    expect(h.present).toBe(0);
    h = redo(h);
    expect(h.present).toBe(1);
    expect(canRedo(h)).toBe(true);
  });

  it('drops the redo stack after a new edit', () => {
    let h = push(push(createHistory('a'), 'b'), 'c');
    h = undo(h);
    h = push(h, 'd');
    expect(canRedo(h)).toBe(false);
    expect(h.past).toEqual(['a', 'b']);
  });

  it('ignores no-op edits', () => {
    const h = createHistory({ x: 1 });
    expect(push(h, h.present)).toBe(h);
  });

  it('coalesces a gesture into one step', () => {
    let h = createHistory(0);
    h = begin(h);
    for (let i = 1; i <= 10; i++) h = update(h, i);
    h = end(h);
    expect(h.present).toBe(10);
    expect(h.past).toEqual([0]);
    h = undo(h);
    expect(h.present).toBe(0);
  });

  it('a gesture with no change adds no step; undo mid-gesture settles first', () => {
    let h = end(begin(createHistory(0)));
    expect(h.past).toHaveLength(0);
    h = update(begin(h), 5);
    expect(canUndo(h)).toBe(true);
    h = undo(h);
    expect(h.present).toBe(0);
    expect(h.pending).toBeNull();
  });

  it('caps its size', () => {
    let h = createHistory(0);
    for (let i = 1; i <= 10; i++) h = push(h, i, 3);
    expect(h.past).toEqual([7, 8, 9]);
  });
});
