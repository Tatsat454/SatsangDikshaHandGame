/**
 * Wiring: input → rules → scene and sound, plus the title, milestone path and results.
 *
 * URL flags:
 *   ?bot=1         a synthetic player plays through the real gesture engine
 *   ?autostart=1   skip the title and start milestone 1 with the mouse
 *   ?mute=1        no sound
 *   ?seed=N        the same blanks every time
 *   ?groups=N      shlokas in a set (default 3)
 *   ?milestone=N   which milestone autostart and the bot begin on
 *   ?speed=K       run the clock K times faster
 */
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/noto-sans/500.css';
import '@fontsource/noto-sans/700.css';
import './style.css';
import { drawHand } from './hand-gesture-kit';
import { Input } from './input';
import { PinchLatch } from './pinch';
import { Bot } from './bot';
import { Sound } from './audio';
import { Scene } from './scene';
import { SHLOKAS, groupLabel } from './shlokas';
import {
  blanksLeft, createWorld, hitSpot, milestones, press, release, startSet, step,
  type Spot, type World,
} from './rules';

const q = new URLSearchParams(location.search);
const flag = (k: string) => q.get(k) === '1';
const BEST_KEY = 'satsang-diksha-hands.best';
const DONE_KEY = 'satsang-diksha-hands.done';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const world = createWorld(SHLOKAS, Number(q.get('seed')) || Date.now(), Number(q.get('groups')) || undefined);
const scene = new Scene($('stage'));
const input = new Input($<HTMLVideoElement>('cam'), document.body);
const sound = new Sound();
const latch = new PinchLatch();
const bot = flag('bot') ? new Bot() : null;
const speed = Number(q.get('speed')) || 1;
sound.muted = flag('mute');

let best = 0;
const done = new Set<string>();
try {
  best = Number(localStorage.getItem(BEST_KEY)) || 0;
  const saved = JSON.parse(localStorage.getItem(DONE_KEY) || '[]');
  if (Array.isArray(saved)) for (const id of saved) if (typeof id === 'string') done.add(id);
} catch { /* storage blocked: fine */ }

let resultsAt = 0;
let resultsPinch = false;
let viewKey = '';

function saveDone() {
  try { localStorage.setItem(DONE_KEY, JSON.stringify([...done])); } catch { /* ignore */ }
}

function show(id: 'title' | 'map' | 'play' | 'results') {
  $('title').classList.toggle('hidden', id !== 'title');
  $('map').classList.toggle('hidden', id !== 'map');
  $('board').classList.toggle('hidden', id !== 'play');
  $('hud').classList.toggle('hidden', id !== 'play');
  $('results').classList.toggle('hidden', id !== 'results');
}

function spots(selector: string): Spot[] {
  const out: Spot[] = [];
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    if (el.classList.contains('hidden')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    out.push({
      id: Number(el.dataset.id),
      x: (r.left + r.width / 2) / innerWidth,
      y: (r.top + r.height / 2) / innerHeight,
      hw: r.width / 2 / innerWidth,
      hh: r.height / 2 / innerHeight,
    });
  }
  return out;
}

function over(el: HTMLElement, x: number, y: number) {
  const r = el.getBoundingClientRect();
  const px = x * innerWidth, py = y * innerHeight;
  return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
}

function paintMap() {
  const root = $('milestones');
  root.replaceChildren();
  for (const m of milestones(world.catalog)) {
    const groups = world.catalog.filter((s) => s.milestone === m.milestone);
    const n = groups.filter((s) => done.has(s.shlokGroup)).length;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ms' + (n === groups.length && groups.length > 0 ? ' done' : n > 0 ? ' now' : '');
    btn.dataset.id = String(m.milestone);
    const label = document.createElement('span');
    label.className = 'pill';
    label.textContent = n === groups.length && groups.length > 0 ? 'Done' : n > 0 ? 'Up next' : 'Open';
    const title = document.createElement('strong');
    title.textContent = `Milestone ${m.milestone}`;
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = n > 0 && n < groups.length ? `${n} of ${groups.length}` : `${groups.length} shlokas`;
    const bar = document.createElement('span');
    bar.className = 'bar';
    const fill = document.createElement('i');
    fill.style.width = `${groups.length ? (n / groups.length) * 100 : 0}%`;
    bar.append(fill);
    btn.append(label, title, count, bar);
    root.append(btn);
  }
  $('done-count').textContent = `${done.size} shlokas finished`;
}

function paintPuzzle() {
  const p = world.puzzle;
  const verse = $('verse');
  verse.replaceChildren();
  $('tray').replaceChildren();
  if (!p) return;
  $('mile-pill').textContent = `Milestone ${p.shlok.milestone}`;
  $('type-pill').textContent = groupLabel(p.shlok.groupType);
  $('progress').textContent = `Shloka ${p.shlok.shlokNumber} · ${world.index + 1} of ${world.set.length}`;
  $('gujarati').textContent = p.shlok.gujarati;
  $('english').textContent = p.shlok.english;
  for (const piece of p.pieces) {
    if (piece.kind === 'gap') {
      const lines = piece.text.split('\n');
      lines.forEach((part, i) => {
        if (i) verse.append(document.createElement('br'));
        if (part) verse.append(document.createTextNode(part));
      });
      continue;
    }
    if (!p.blanks.includes(piece.wordIndex)) {
      verse.append(document.createTextNode(piece.text));
      continue;
    }
    const chip = document.createElement('span');
    const tileId = world.filled.get(piece.wordIndex);
    const tile = tileId ? p.tiles.find((t) => t.id === tileId) : undefined;
    chip.className = tile ? 'chip filled' : 'chip blank';
    chip.dataset.id = String(piece.wordIndex);
    if (tile) chip.textContent = tile.word;
    else {
      chip.textContent = '\u00a0';
      const letters = [...(p.expected.get(piece.wordIndex) ?? 'word')].length;
      chip.style.minWidth = `${Math.min(12, Math.max(3.2, letters * 0.62))}em`;
    }
    verse.append(chip);
  }
  for (const tile of p.tiles) {
    if ([...world.filled.values()].includes(tile.id)) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tile' + (world.held === tile.id ? ' is-held' : '');
    btn.dataset.id = String(tile.id);
    btn.textContent = tile.word;
    $('tray').append(btn);
  }
  const held = world.held !== null ? p.tiles.find((t) => t.id === world.held) : undefined;
  $('floater').textContent = held ? held.word : '';
  $('floater').classList.toggle('hidden', !held);
}

function syncView() {
  const key = [
    world.phase, world.puzzle?.shlok.shlokGroup ?? '', world.index, world.held ?? '',
    [...world.filled.entries()].map((e) => e.join(':')).join(','),
  ].join('|');
  if (key === viewKey) return;
  viewKey = key;
  if (world.phase === 'play') paintPuzzle();
}

function openMap() {
  world.phase = 'map';
  world.held = null;
  viewKey = '';
  paintMap();
  show('map');
}

function beginSet(milestone: number) {
  if (world.phase === 'play') return;
  sound.start();
  startSet(world, milestone, done);
  latch.reset();
  viewKey = '';
  show('play');
  paintPuzzle();
}

function finish() {
  for (const s of world.set) done.add(s.shlokGroup);
  saveDone();
  const isBest = world.score > best;
  if (isBest) {
    best = world.score;
    try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* ignore */ }
  }
  const n = world.set.length;
  $('r-kicker').textContent = `Milestone ${world.milestone}`;
  $('r-score').textContent = String(world.score);
  const across = `${world.score} first-try word${world.score === 1 ? '' : 's'} across ${n} shloka${n === 1 ? '' : 's'}.`;
  $('r-line').textContent = isBest && world.score > 0 ? `${across} A new best.` : `${across} Best so far: ${best}.`;
  resultsAt = performance.now();
  resultsPinch = false;
  sound.end();
  show('results');
}

function nextMilestone() {
  const miles = milestones(world.catalog);
  for (const m of miles) {
    const groups = world.catalog.filter((s) => s.milestone === m.milestone);
    if (groups.some((s) => !done.has(s.shlokGroup))) return m.milestone;
  }
  return miles[0]?.milestone ?? 1;
}

$('b-cam').addEventListener('click', async () => {
  sound.start();
  $('err').textContent = '';
  $('b-cam').textContent = 'Starting the camera…';
  try {
    await input.startCamera();
    $('preview').classList.remove('hidden');
    openMap();
  } catch {
    $('b-cam').textContent = 'Use my camera';
    $('err').textContent = 'The camera is unavailable or was blocked. You can still play with the mouse or touch.';
  }
});
$('b-mouse').addEventListener('click', () => { input.setMode('pointer'); openMap(); });
$('milestones').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button');
  if (!btn || world.phase !== 'map') return;
  beginSet(Number(btn.dataset.id));
});
$('b-next').addEventListener('click', () => { if (world.phase === 'results') beginSet(world.milestone); });
$('b-path').addEventListener('click', () => { if (world.phase === 'results') openMap(); });
$('tray').addEventListener('pointerdown', (e) => e.preventDefault());

addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') sound.setMuted(!sound.muted);
  if (e.code !== 'Space') return;
  e.preventDefault();
  sound.start();
  if (world.phase === 'title') { if (input.mode === 'none') input.setMode('pointer'); openMap(); }
  else if (world.phase === 'map') beginSet(nextMilestone());
  else if (world.phase === 'results') beginSet(world.milestone);
});
addEventListener('resize', () => scene.resize());

if (bot) input.setMode('bot');
if (bot || flag('autostart')) {
  if (input.mode === 'none') input.setMode('pointer');
  beginSet(Number(q.get('milestone')) || 1);
} else show('title');

const pv = $<HTMLCanvasElement>('preview'), pg = pv.getContext('2d')!;
function drawPreview() {
  if (input.mode !== 'camera') return;
  const v = input.hands.video, w = pv.width, h = pv.height;
  pg.save(); pg.scale(-1, 1); pg.drawImage(v, -w, 0, w, h); pg.restore();
  if (input.hand) drawHand(pg, input.hand.landmarks, w, h, { color: '#16345c', lineWidth: 2, jointRadius: 2 });
}

const ring = $('hand-ring');
let last = performance.now(), t = 0, fps = 60;
function frame(now: number) {
  requestAnimationFrame(frame);
  const real = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (real > 0) fps += (1 / real - fps) * 0.05;
  const dt = real * speed;
  t += dt;

  if (bot) input.bot = bot.update(world, { tiles: spots('#tray .tile'), blanks: spots('#verse .blank') }, dt, scene.aspect);
  input.update(real);
  const h = input.hand;
  const edge = latch.update(h ? h.pinch : 0);
  if (h && edge === 'press') {
    if (world.phase === 'play') press(world, h.screen.x, h.screen.y, spots('#tray .tile'), scene.aspect);
    else if (world.phase === 'map') {
      const card = hitSpot(spots('#milestones button'), h.screen.x, h.screen.y, scene.aspect);
      if (card) beginSet(card.id);
    } else if (world.phase === 'results' && now - resultsAt > 1200) resultsPinch = true;
  }
  if (h && edge === 'release') {
    if (resultsPinch) {
      resultsPinch = false;
      if (world.phase === 'results') {
        if (over($('b-path'), h.screen.x, h.screen.y)) openMap();
        else beginSet(world.milestone);
      }
    } else if (world.phase === 'play') {
      const drop = release(world, h.screen.x, h.screen.y, spots('#verse .blank'), scene.aspect);
      if (drop === 'correct') { scene.burst(h.screen.x, h.screen.y); sound.chime(world.score); }
      else if (drop === 'wrong') sound.bonk();
    }
  }

  const before = world.phase;
  const advanced = step(world, dt);
  if (before === 'play' && advanced === 'results') finish();
  if (advanced === 'advance') viewKey = '';

  syncView();
  $('score').textContent = String(world.score);
  if (h && world.phase === 'play') {
    ring.classList.remove('hidden');
    ring.style.left = `${h.screen.x * innerWidth}px`;
    ring.style.top = `${h.screen.y * innerHeight}px`;
    ring.style.transform = `scale(${1 - h.pinch * 0.28})`;
    if (world.held !== null) {
      $('floater').style.left = `${h.screen.x * innerWidth}px`;
      $('floater').style.top = `${h.screen.y * innerHeight}px`;
    }
  } else ring.classList.add('hidden');

  scene.render(real, t);
  drawPreview();
}
requestAnimationFrame(frame);

Object.defineProperty(window, '__game', {
  get: () => ({
    phase: world.phase,
    score: world.score,
    placed: world.placed,
    caught: world.placed,
    wrong: world.wrong,
    time: world.time,
    blanks: blanksLeft(world),
    milestone: world.milestone,
    shlok: world.puzzle?.shlok.shlokNumber ?? null,
    group: world.puzzle?.shlok.shlokGroup ?? null,
    held: world.held,
    tiles: world.puzzle?.tiles.map((t) => ({ id: t.id, word: t.word, answer: t.answer })) ?? [],
    mode: input.mode,
    hand: input.hand ? { ...input.hand.screen, pinch: input.hand.pinch } : null,
    fps: Math.round(fps),
    dpr: scene.renderer.getPixelRatio(),
    best,
  }),
});

export type { World };
