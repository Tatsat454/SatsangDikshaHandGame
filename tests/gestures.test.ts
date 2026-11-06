// A pinch and a closed fist must both read as a grab, through the real engine, for both hands.
// The latch must turn that into exactly one press and one release.
import { describe, expect, it } from 'vitest';
import { GestureEngine, syntheticHand, SYNTHETIC_POSES as P } from '../src/hand-gesture-kit';
import { fistStrength, grabStrength, PinchLatch } from '../src/pinch';

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

  it('a closed fist grabs even with the pinch ignored, and an open or pointing hand does not', () => {
    const fist = run(P.fist).features.curl;
    const thumbUp = run(P['thumbs-up']).features.curl;
    expect(grabStrength(0, fist)).toBeGreaterThan(0.75);
    expect(fistStrength(thumbUp)).toBeGreaterThan(0.75);
    for (const pose of [P.open, P.point, P.pinch, P.gun, P.victory, P.claw]) {
      expect(fistStrength(run(pose).features.curl)).toBeLessThan(0.3);
    }
  });

  it('the latch gives one press and one release for a pinch with jitter', () => {
    const l = new PinchLatch();
    const edges = [0.1, 0.4, 0.65, 0.55, 0.7, 0.45, 0.5, 0.3, 0.4, 0.2].map((p) => l.update(p)).filter(Boolean);
    expect(edges).toEqual(['press', 'release']);
  });
});
