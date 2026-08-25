/**
 * HistoryManager: Fixed 32-Slot Snapshot Undo/Redo Engine
 *
 * Implements deterministic circular history snapshots on pointer interaction release
 * with zero memory thrashing and instant sub-millisecond undo/redo.
 */

export const MAX_HISTORY_SLOTS = 32;

export class HistoryManager {
  private readonly maxSlots: number;
  private slots: string[] = [];
  private currentIndex = -1;

  constructor(maxSlots = MAX_HISTORY_SLOTS) {
    this.maxSlots = maxSlots;
  }

  canUndo(): boolean {
    return this.currentIndex > 0;
  }

  canRedo(): boolean {
    return this.currentIndex >= 0 && this.currentIndex < this.slots.length - 1;
  }

  getHistoryLength(): number {
    return this.slots.length;
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  getCurrentSnapshot(): string | null {
    if (this.currentIndex >= 0 && this.currentIndex < this.slots.length) {
      return this.slots[this.currentIndex];
    }
    return null;
  }

  pushSnapshot(snapshot: string): void {
    // Truncate any forward redo history
    if (this.currentIndex < this.slots.length - 1) {
      this.slots.splice(this.currentIndex + 1);
    }

    this.slots.push(snapshot);

    // Enforce circular capacity limit
    if (this.slots.length > this.maxSlots) {
      this.slots.shift();
    }

    this.currentIndex = this.slots.length - 1;
  }

  undo(): string | null {
    if (!this.canUndo()) {
      return null;
    }
    this.currentIndex--;
    return this.slots[this.currentIndex];
  }

  redo(): string | null {
    if (!this.canRedo()) {
      return null;
    }
    this.currentIndex++;
    return this.slots[this.currentIndex];
  }

  clear(): void {
    this.slots.length = 0;
    this.currentIndex = -1;
  }
}
