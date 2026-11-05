/**
 * Every input source becomes the same thing: one hand with a screen position and a pinch strength.
 *
 *  - Camera: MediaPipe through the kit (`createHands`).
 *  - Mouse / touch: a synthetic hand (kit `syntheticHand`) is injected at the pointer; holding the button pinches.
 *  - Bot (`?bot=1`): src/bot.ts sets `bot` every frame and it is injected the same way.
 *
 * Pointer and bot hands are real synthetic landmarks fed through the real gesture engine, so the game reads them
 * exactly as it reads a camera hand, and the bot exercises the same code path a player does.
 */
import { createHands, fromScreen, toScreen, syntheticHand, type Hands, type HandInput, type Region, type Vec3 } from './hand-gesture-kit';

/** The part of the camera image that maps onto the whole screen, so players never have to reach the frame edges. */
export const REGION: Region = { x0: 0.14, x1: 0.86, y0: 0.1, y1: 0.8 };

export type Mode = 'none' | 'camera' | 'pointer' | 'bot';

export interface HandView {
  /** Palm centre on screen, 0..1. */
  screen: { x: number; y: number };
  /** Thumb-index pinch strength 0..1 (from the engine). */
  pinch: number;
  landmarks: Vec3[];
}

/** Seconds for a held mouse button to close the pinch fully. */
const POINTER_PINCH_S = 0.08;

export class Input {
  readonly hands: Hands;
  mode: Mode = 'none';
  /** The first tracked hand this frame, or null. */
  hand: HandView | null = null;
  /** Set by the bot each frame. */
  bot: { x: number; y: number; pinch: number } | null = null;
  private ptr = { x: 0.5, y: 0.6, down: false, pinch: 0, seen: false, touch: false };

  constructor(video: HTMLVideoElement, el: HTMLElement) {
    this.hands = createHands({
      video,
      config: { pose: { experimental: false } },
      numHands: 1,
      onFrame: (f) => {
        const h = f.hands[0];
        this.hand = h ? { screen: toScreen(h.features.center, REGION), pinch: h.pinch, landmarks: h.landmarks } : null;
      },
    });
    const move = (e: PointerEvent) => {
      this.ptr.x = e.clientX / innerWidth; this.ptr.y = e.clientY / innerHeight;
      this.ptr.seen = true; this.ptr.touch = e.pointerType === 'touch';
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerdown', (e) => { move(e); this.ptr.down = true; });
    const up = () => { this.ptr.down = false; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  async startCamera() { await this.hands.startCamera(); this.setMode('camera'); }

  setMode(m: Mode) {
    this.mode = m;
    this.hands.inject(m === 'camera' ? null : []);
  }

  update(dt: number) {
    if (this.mode === 'camera') return;
    const out: HandInput[] = [];
    if (this.mode === 'pointer' && this.ptr.seen) {
      const p = this.ptr;
      p.pinch = p.down ? Math.min(1, p.pinch + dt / POINTER_PINCH_S) : Math.max(0, p.pinch - dt / POINTER_PINCH_S);
      // on touch the hand floats a little above the finger, so the finger doesn't hide what it's reaching for
      out.push(this.synth(p.x, p.touch ? p.y - 0.08 : p.y, p.pinch));
    } else if (this.mode === 'bot' && this.bot) {
      out.push(this.synth(this.bot.x, this.bot.y, this.bot.pinch));
    }
    this.hands.inject(out);
  }

  private synth(sx: number, sy: number, pinch: number): HandInput {
    const c = fromScreen({ x: sx, y: sy }, REGION);
    return syntheticHand(c.x, c.y, { curl: [0.1, 0.15 + pinch * 0.35, 0.2, 0.25, 0.3], pinch }, { scale: 0.17 });
  }
}
