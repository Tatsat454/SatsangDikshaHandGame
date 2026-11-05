/**
 * Procedural sound: a light pad, a chime when a word lands, a soft bonk when it does not.
 * One master gain and a gentle compressor. No audio files.
 *
 * Level target: p90 about -29 dBFS while playing (`npm run loud`).
 */
const PENTA = [0, 2, 4, 7, 9];

export class Sound {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private verb!: ConvolverNode;
  private pad: GainNode | null = null;
  muted = false;

  /** Call from a click or key press. Safe to call again. */
  start() {
    if (this.ctx) { void this.ctx.resume(); return; }
    try { this.ctx = new AudioContext(); } catch { return; }
    const ctx = this.ctx;
    this.master = new GainNode(ctx, { gain: this.muted ? 0 : 0.55 });
    this.master.connect(new DynamicsCompressorNode(ctx, { threshold: -16, ratio: 4 })).connect(ctx.destination);
    this.verb = new ConvolverNode(ctx, { buffer: this.impulse(2.2) });
    this.verb.connect(new GainNode(ctx, { gain: 0.28 })).connect(this.master);
    this.startPad();
  }

  private impulse(secs: number) {
    const ctx = this.ctx!, n = Math.floor(ctx.sampleRate * secs), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    }
    return b;
  }

  private startPad() {
    const ctx = this.ctx!;
    this.pad = new GainNode(ctx, { gain: 0 });
    const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 900, Q: 0.5 });
    this.pad.connect(lp).connect(this.master);
    lp.connect(this.verb);
    for (const [f, d] of [[196, -3], [247, 2], [294, 0], [392, 4]]) {
      const o = new OscillatorNode(ctx, { type: 'sine', frequency: f, detune: d });
      o.connect(new GainNode(ctx, { gain: 0.035 })).connect(this.pad);
      o.start();
    }
    this.pad.gain.setTargetAtTime(0.45, ctx.currentTime, 1.8);
  }

  /** A correct drop. `step` climbs a pentatonic scale. */
  chime(step: number) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = Math.min(Math.max(step, 0), 9);
    const semis = PENTA[n % 5] + 12 * Math.floor(n / 5);
    const freq = 523.25 * Math.pow(2, semis / 12);
    const g = new GainNode(ctx, { gain: 0 });
    g.connect(this.master); g.connect(this.verb);
    const o = new OscillatorNode(ctx, { type: 'sine', frequency: freq });
    const o2 = new OscillatorNode(ctx, { type: 'triangle', frequency: freq * 2 });
    o.connect(g); o2.connect(new GainNode(ctx, { gain: 0.15 })).connect(g);
    o.start(t); o2.start(t); o.stop(t + 1.4); o2.stop(t + 1.4);
    g.gain.linearRampToValueAtTime(0.09, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  }

  /** A word that does not belong in that blank. */
  bonk() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = new OscillatorNode(ctx, { type: 'sine', frequency: 180 });
    const g = new GainNode(ctx, { gain: 0 });
    o.connect(g); g.connect(this.master);
    g.gain.linearRampToValueAtTime(0.05, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.start(t); o.stop(t + 0.2);
  }

  /** The set is over. */
  end() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const f of [392, 494, 587]) {
      const o = new OscillatorNode(ctx, { type: 'sine', frequency: f });
      const g = new GainNode(ctx, { gain: 0 });
      o.connect(g); g.connect(this.master); g.connect(this.verb);
      g.gain.linearRampToValueAtTime(0.05, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      o.start(t); o.stop(t + 1.7);
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }
}
