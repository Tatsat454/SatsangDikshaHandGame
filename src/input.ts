/**
 * Every input source becomes the same thing: one hand with a screen position and a grab strength.
 *
 *  - Camera: MediaPipe through the kit (`createHands`).
 *  - Mouse / touch: a synthetic hand (kit `syntheticHand`) is injected at the pointer; holding the button pinches.
 *  - Bot (`?bot=1`): src/bot.ts sets `bot` every frame and it is injected the same way.
 *
 * Pointer and bot hands are real synthetic landmarks fed through the real gesture engine, so the game reads them
 * exactly as it reads a camera hand, and the bot exercises the same code path a player does.
 */
import { createHands, fromScreen, toScreen, syntheticHand, type Hands, type HandInput, type Region, type Vec3 } from './hand-gesture-kit';
import { grabStrength } from './pinch';

/** The part of the camera image that maps onto the whole screen, so players never have to reach the frame edges. */
export const REGION: Region = { x0: 0.14, x1: 0.86, y0: 0.1, y1: 0.8 };

export type Mode = 'none' | 'camera' | 'pointer' | 'bot';

export interface HandView {
  /** Palm centre on screen, 0..1. */
  screen: { x: number; y: number };
  /** Thumb-index pinch strength 0..1 (from the engine). */
  pinch: number;
  /** Pinch or a closed fist, whichever is stronger. This is what picks a tile up. */
  grab: number;
  landmarks: Vec3[];
}

/** Seconds for a held mouse button to close the pinch fully. */
const POINTER_PINCH_S = 0.08;
/** A real pointer must travel this far (px) before it takes the cursor from the camera. */
const POINTER_TAKE_PX = 14;
/** After the pointer rests this long, a moving camera hand can take the cursor back. */
const HAND_RETURN_S = 0.7;
/** How far that hand must move, in camera-image units, before it takes over. */
const HAND_RETURN_MOVE = 0.08;

export class Input {
  readonly hands: Hands;
  mode: Mode = 'none';
  /** The first tracked hand this frame, or null. */
  hand: HandView | null = null;
  /** True after the camera has started once. */
  cameraReady = false;
  /** Set by the bot each frame. */
  bot: { x: number; y: number; pinch: number } | null = null;
  private ptr = { x: 0.5, y: 0.6, down: false, pinch: 0, seen: false, touch: false, idle: 0 };
  /** Camera-hand position when the pointer went idle, so a resting hand does not snatch the cursor. */
  private handBack: { x: number; y: number } | null = null;

  constructor(video: HTMLVideoElement, el: HTMLElement) {
    this.hands = createHands({
      video,
      config: { pose: { experimental: false } },
      numHands: 1,
      onFrame: (f) => {
        const h = f.hands[0];
        this.hand = h ? {
          screen: toScreen(h.features.center, REGION),
          pinch: h.pinch,
          grab: grabStrength(h.pinch, h.features.curl),
          landmarks: h.landmarks,
        } : null;
      },
    });
    const move = (e: PointerEvent) => {
      const x = e.clientX / innerWidth, y = e.clientY / innerHeight;
      const dist = Math.hypot((x - this.ptr.x) * innerWidth, (y - this.ptr.y) * innerHeight);
      this.ptr.x = x; this.ptr.y = y;
      this.ptr.seen = true; this.ptr.touch = e.pointerType === 'touch';
      if (this.mode === 'pointer') this.ptr.idle = 0;
      // Moving or clicking the real mouse takes the cursor from the camera. No button.
      if (e.isTrusted && this.mode === 'camera' && dist >= POINTER_TAKE_PX) this.usePointer();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerdown', (e) => {
      move(e);
      // A click takes over even when the pointer barely moved.
      if (e.isTrusted && this.mode === 'camera') this.usePointer();
      // Hint buttons are clicks, not grabs.
      if (e.target instanceof Element && e.target.closest('[data-ui]')) return;
      this.ptr.down = true;
    });
    const up = () => { this.ptr.down = false; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  async startCamera() {
    if (!this.cameraReady) {
      await this.hands.startCamera();
      this.cameraReady = true;
    }
    this.setMode('camera');
  }

  setMode(m: Mode) {
    this.mode = m;
    this.ptr.down = false;
    this.ptr.pinch = 0;
    this.ptr.idle = 0;
    this.handBack = null;
    this.hands.inject(m === 'camera' ? null : []);
  }

  /** The real pointer is in charge until the hand moves again. */
  private usePointer() {
    if (this.mode !== 'camera') return;
    this.mode = 'pointer';
    this.ptr.pinch = 0;
    this.ptr.idle = 0;
    this.handBack = null;
  }

  update(dt: number) {
    if (this.mode === 'pointer' && this.cameraReady) this.maybeReturnToHand(dt);
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

  /** A still mouse lets a moving hand take the cursor back. A resting hand does not. */
  private maybeReturnToHand(dt: number) {
    if (this.ptr.down) { this.ptr.idle = 0; this.handBack = null; return; }
    this.ptr.idle += dt;
    if (this.ptr.idle < HAND_RETURN_S) { this.handBack = null; return; }
    const det = this.hands.tracker.detect(performance.now());
    if (!det) return;
    const raw = det.hands[0]?.landmarks;
    if (!raw) { this.handBack = null; return; }
    let x = 0, y = 0;
    for (const i of [0, 5, 9, 13, 17]) { x += raw[i].x; y += raw[i].y; }
    const c = { x: x / 5, y: y / 5 };
    if (!this.handBack) { this.handBack = c; return; }
    if (Math.hypot(c.x - this.handBack.x, c.y - this.handBack.y) >= HAND_RETURN_MOVE) this.setMode('camera');
  }

  private synth(sx: number, sy: number, pinch: number): HandInput {
    const c = fromScreen({ x: sx, y: sy }, REGION);
    return syntheticHand(c.x, c.y, { curl: [0.1, 0.15 + pinch * 0.35, 0.2, 0.25, 0.3], pinch }, { scale: 0.17 });
  }
}
