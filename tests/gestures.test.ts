// The gesture this game asks for (a pinch) must be recognised from synthetic hands through the real engine, for
// both hands, and the latch must turn it into exactly one press and one release.
import { describe, expect, it } from 'vitest';
import { GestureEngine, syntheticHand, SYNTHETIC_POSES as P } from '../src/hand-gesture-kit';
import { PinchLatch } from '../src/pinch';

const run = (pose: typeof P.open, handedness: 'Left' | 'Right' = 'Right', frames = 10) => {
  const e = new GestureEngine();
  let f = e.update([syntheticHand(0.5, 0.5, pose, { handedness })], 0);
  for (let i = 1; i < frames; i++) f = e.update([syntheticHand(0.5, 0.5, pose, { handedness })], i * 33);
  return f.hands[0];
};

describe('gestures', () => {
  for (const hand of ['Left', 'Right'] as const) {
    it(`${hand} pinch reads as a strong pinch, an open hand as none`, () => {
      expect(run(P.pinch, hand).pinch).toBeGreaterThan(0.75);
      expect(run(P.open, hand).pinch).toBeLessThan(0.3);
    });
  }

  it('the latch gives one press and one release for a pinch with jitter', () => {
    const l = new PinchLatch();
    const edges = [0.1, 0.4, 0.65, 0.55, 0.7, 0.45, 0.5, 0.3, 0.4, 0.2].map((p) => l.update(p)).filter(Boolean);
    expect(edges).toEqual(['press', 'release']);
  });
});
