import { smooth } from './hand-gesture-kit';

/**
 * Turns a grab strength (0..1) into clean press / release edges.
 *
 * A grab is a pinch or a closed fist, whichever is stronger. Two thresholds (hysteresis) so a hold near one
 * value doesn't flicker, and a low "on" threshold because real pinches rarely reach 1.
 */

export const PINCH_ON = 0.6;
export const PINCH_OFF = 0.35;

/**
 * 0..1 for a closed hand, like ✊. Every finger has to be curling, so a point or a pinch stays low
 * (those still grab through pinch strength). The thumb can stick out: a fist with the thumb up still counts.
 */
export function fistStrength(curl: readonly [number, number, number, number, number]): number {
  const fingers = [curl[1], curl[2], curl[3], curl[4]];
  const min = Math.min(...fingers);
  const mean = (fingers[0] + fingers[1] + fingers[2] + fingers[3]) / 4;
  return smooth(0.42, 0.72, min * 0.7 + mean * 0.3);
}

/** Pinch or fist. */
export function grabStrength(pinch: number, curl: readonly [number, number, number, number, number]): number {
  return Math.max(pinch, fistStrength(curl));
}

export class PinchLatch {
  down = false;
  /** Feed the grab strength each frame; returns 'press', 'release' or null. */
  update(pinch: number): 'press' | 'release' | null {
    if (!this.down && pinch >= PINCH_ON) { this.down = true; return 'press'; }
    if (this.down && pinch <= PINCH_OFF) { this.down = false; return 'release'; }
    return null;
  }
  reset() { this.down = false; }
}
