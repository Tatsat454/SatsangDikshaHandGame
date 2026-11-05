/**
 * A bright blue sky, a few drifting clouds, and a ring that follows the palm.
 * Glow is a painted sprite, not bloom. No lights and no shadow maps.
 */
import * as THREE from 'three';

const FOV = 50;
const CAM_Z = 10;

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d')! };
}

function discTexture(): THREE.Texture {
  const S = 128, { c, g } = canvas(S, S);
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  for (let k = 0; k <= 16; k++) {
    const u = k / 16;
    grd.addColorStop(u, `rgba(255,255,255,${(Math.exp(-u * u * 40) * 0.85 + Math.pow(1 - u, 3) * 0.2).toFixed(3)})`);
  }
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function paintSky(aspect: number): THREE.Texture {
  const H = 1024, W = Math.round(H * aspect), { c, g } = canvas(W, H);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#f3faff');
  sky.addColorStop(0.55, '#c5e4fb');
  sky.addColorStop(1, '#8ec4f6');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // a few soft bubbles painted once, so the sky is not empty and the frame stays cheap
  const bubbles: [number, number, number, string][] = [
    [0.12, 0.22, 0.08, 'rgba(255,255,255,0.35)'],
    [0.82, 0.18, 0.11, 'rgba(255,255,255,0.28)'],
    [0.7, 0.72, 0.07, 'rgba(255,255,255,0.22)'],
    [0.2, 0.78, 0.05, 'rgba(180, 220, 255, 0.35)'],
  ];
  for (const [x, y, r, col] of bubbles) {
    g.fillStyle = col;
    g.beginPath(); g.arc(x * W, y * H, r * H, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Spark { s: THREE.Sprite; vx: number; vy: number; life: number }
interface Cloud { s: THREE.Sprite; speed: number; baseY: number }

export class Scene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  private glow = discTexture();
  private sparks: Spark[] = [];
  private clouds: Cloud[] = [];
  private viewW = 1;
  private viewH = 1;
  aspect = 1;

  constructor(el: HTMLElement, dprCap = 2) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap));
    el.appendChild(this.renderer.domElement);
    this.camera.position.set(0, 0, CAM_Z);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffffff, transparent: true, depthWrite: false, opacity: 0.55 }));
      s.renderOrder = 0;
      this.scene.add(s);
      this.clouds.push({ s, speed: 0.04 + i * 0.015, baseY: 0.15 + (i % 2) * 0.55 });
    }
    this.resize();
    this.renderer.compile(this.scene, this.camera);
  }

  /** Ignores a 0×0 window (a hidden tab or pane), which would otherwise produce NaNs. */
  resize() {
    const w = innerWidth, h = innerHeight;
    if (w < 2 || h < 2) return;
    this.aspect = w / h;
    this.renderer.setSize(w, h);
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    this.viewH = 2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    this.viewW = this.viewH * this.aspect;
    (this.scene.background as THREE.Texture | null)?.dispose();
    this.scene.background = paintSky(this.aspect);
  }

  toWorld(x: number, y: number): THREE.Vector3 {
    return new THREE.Vector3((x - 0.5) * this.viewW, (0.5 - y) * this.viewH, 0);
  }

  /** A small burst where a word landed in the right blank. */
  burst(x: number, y: number) {
    const p = this.toWorld(x, y);
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glow, color: i % 2 ? 0x1f6fe5 : 0xffffff, transparent: true, depthWrite: false,
      }));
      s.position.copy(p);
      const a = Math.random() * Math.PI * 2, v = 0.4 + Math.random() * 1.1;
      this.sparks.push({ s, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 0.3, life: 1 });
      this.scene.add(s);
    }
  }

  render(dt: number, t: number) {
    if (innerWidth < 2 || innerHeight < 2) return;
    this.clouds.forEach((c, i) => {
      const u = (t * c.speed + i * 0.27) % 1;
      const x = -0.15 + u * 1.3;
      c.s.position.copy(this.toWorld(x, c.baseY + Math.sin(t * 0.3 + i) * 0.02)).setZ(-1);
      const size = this.viewH * (0.16 + (i % 3) * 0.04);
      c.s.scale.set(size * 2.4, size, 1);
    });
    for (const k of this.sparks) {
      k.life -= dt * 1.5;
      k.s.position.x += k.vx * dt;
      k.s.position.y += k.vy * dt;
      k.s.scale.setScalar(0.18 * k.life + 0.04);
      k.s.material.opacity = Math.max(0, k.life);
    }
    for (const k of this.sparks.filter((q) => q.life <= 0)) { this.scene.remove(k.s); k.s.material.dispose(); }
    this.sparks = this.sparks.filter((q) => q.life > 0);
    this.renderer.render(this.scene, this.camera);
  }
}
