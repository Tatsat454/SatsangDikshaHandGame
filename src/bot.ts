/**
 * ?bot=1: a synthetic player. It steers a hand through the real gesture engine, pinches a word tile,
 * carries it to a blank, and lets go. The first drop of a shloka misses on purpose, then it finishes.
 */
import type { Spot, World } from './rules';

type Step = 'seek' | 'close' | 'carry' | 'settle' | 'open';

export class Bot {
  x = 0.5;
  y = 0.78;
  pinch = 0;
  private step: Step = 'seek';
  private timer = 0;
  private seen = '';
  private missed = false;
  private resultsT = 0;

  update(w: World, layout: { tiles: Spot[]; blanks: Spot[] }, dt: number, aspect: number) {
    if (w.phase === 'results') {
      this.resultsT += dt;
      this.pinch = this.resultsT > 1.7 && this.resultsT < 2.15 ? 1 : 0;
      return this.out();
    }
    this.resultsT = 0;
    if (w.phase !== 'play' || !w.puzzle || w.advanceIn >= 0) {
      this.pinch = 0;
      return this.out();
    }
    const id = `${w.puzzle.shlok.shlokGroup}:${w.index}`;
    if (id !== this.seen) { this.seen = id; this.step = 'seek'; this.missed = false; this.pinch = 0; }

    const placed = new Set(w.filled.values());
    const blankId = w.puzzle.blanks.find((b) => !w.filled.has(b));
    const blank = layout.blanks.find((s) => s.id === blankId);
    const want = blankId === undefined ? undefined : w.puzzle.expected.get(blankId);
    const tileSpot = layout.tiles.find((s) => {
      if (placed.has(s.id)) return false;
      const tile = w.puzzle!.tiles.find((t) => t.id === s.id);
      return !!tile && tile.word === want && tile.answer !== -1;
    });
    if (!blank || !tileSpot) { this.pinch = 0; return this.out(); }

    const aim = this.step === 'carry' && !this.missed
      ? { ...blank, y: Math.min(0.92, blank.y + 0.18) }
      : this.step === 'seek' || this.step === 'close' ? tileSpot : blank;

    if (this.step === 'seek') {
      this.pinch = 0;
      this.moveTo(aim, dt, aspect, 1.6);
      if (this.near(aim, aspect)) { this.step = 'close'; this.timer = 0; }
    } else if (this.step === 'close') {
      this.pinch = 1;
      this.moveTo(tileSpot, dt, aspect, 1.6);
      this.timer += dt;
      if (this.timer > 0.24) this.step = 'carry';
    } else if (this.step === 'carry') {
      this.pinch = 1;
      this.moveTo(aim, dt, aspect, 1.35);
      if (this.near(aim, aspect)) { this.step = 'settle'; this.timer = 0; }
    } else if (this.step === 'settle') {
      this.pinch = 1;
      this.moveTo(aim, dt, aspect, 1.35);
      this.timer += dt;
      if (this.timer > 0.16) { this.step = 'open'; this.timer = 0; }
    } else {
      this.pinch = 0;
      this.timer += dt;
      if (this.timer > 0.28) {
        if (!this.missed) this.missed = true;
        this.step = 'seek';
      }
    }
    return this.out();
  }

  private moveTo(s: Spot, dt: number, aspect: number, speed: number) {
    const dx = (s.x - this.x) * aspect, dy = s.y - this.y, d = Math.hypot(dx, dy);
    const step = Math.min(d, speed * dt);
    if (d > 1e-4) { this.x += (dx / d) * step / aspect; this.y += (dy / d) * step; }
  }

  private near(s: Spot, aspect: number) {
    return Math.hypot((s.x - this.x) * aspect, s.y - this.y) < 0.03;
  }

  private out() { return { x: this.x, y: this.y, pinch: this.pinch }; }
}
