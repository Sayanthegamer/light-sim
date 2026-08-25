import { describe, it, expect, beforeEach } from 'vitest';
import { HistoryManager, MAX_HISTORY_SLOTS } from '../../src/engine/state/historyManager';

describe('HistoryManager (32-Slot Snapshot Undo/Redo Engine)', () => {
  let history: HistoryManager;

  beforeEach(() => {
    history = new HistoryManager();
  });

  it('initializes with empty history and cannot undo or redo', () => {
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(history.getHistoryLength()).toBe(0);
    expect(history.undo()).toBeNull();
    expect(history.redo()).toBeNull();
  });

  it('pushes snapshots and performs deterministic undo and redo', () => {
    history.pushSnapshot('state_1');
    history.pushSnapshot('state_2');
    history.pushSnapshot('state_3');

    expect(history.getHistoryLength()).toBe(3);
    expect(history.getCurrentIndex()).toBe(2);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);

    // Undo from state_3 -> state_2
    const s2 = history.undo();
    expect(s2).toBe('state_2');
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(true);

    // Undo from state_2 -> state_1
    const s1 = history.undo();
    expect(s1).toBe('state_1');
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);

    // Redo from state_1 -> state_2
    const r2 = history.redo();
    expect(r2).toBe('state_2');
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(true);

    // Redo from state_2 -> state_3
    const r3 = history.redo();
    expect(r3).toBe('state_3');
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  it('truncates redo history when a new action is pushed after undo', () => {
    history.pushSnapshot('state_1');
    history.pushSnapshot('state_2');
    history.pushSnapshot('state_3');

    history.undo(); // now at state_2
    history.pushSnapshot('state_4_new');

    expect(history.getHistoryLength()).toBe(3); // state_1, state_2, state_4_new
    expect(history.getCurrentIndex()).toBe(2);
    expect(history.canRedo()).toBe(false);

    const s2 = history.undo();
    expect(s2).toBe('state_2');
  });

  it('enforces maximum 32-slot circular buffer capacity without leaking memory', () => {
    expect(MAX_HISTORY_SLOTS).toBe(32);

    for (let i = 1; i <= 40; i++) {
      history.pushSnapshot(`state_${i}`);
    }

    expect(history.getHistoryLength()).toBe(32);
    expect(history.getCurrentIndex()).toBe(31);
    expect(history.getCurrentSnapshot()).toBe('state_40');

    // Undo 31 times to reach oldest preserved state (state_9)
    for (let i = 0; i < 31; i++) {
      history.undo();
    }

    expect(history.getCurrentSnapshot()).toBe('state_9');
    expect(history.canUndo()).toBe(false);
  });

  it('clears all history on reset', () => {
    history.pushSnapshot('state_1');
    history.pushSnapshot('state_2');
    history.clear();

    expect(history.getHistoryLength()).toBe(0);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });
});
