/**
 * Fill-in-the-blank shlokas. No DOM and no three.js: a pinch or a fist grabs a word tile, a release drops it
 * on a blank. Positions come in as screen-space spots (0..1) measured by the wiring each frame.
 */
import { milestoneSummary, type Shlok } from './shlokas';

export type Phase = 'title' | 'map' | 'play' | 'results';

export interface Piece {
  kind: 'word' | 'gap';
  text: string;
  /** Index among word pieces, or -1 for a gap. */
  wordIndex: number;
}

export interface Tile {
  id: number;
  word: string;
  /** Word index this tile belongs in, or -1 for a distractor. */
  answer: number;
}

export interface Puzzle {
  shlok: Shlok;
  pieces: Piece[];
  /** Word indexes that are blanks, in reading order. */
  blanks: number[];
  expected: Map<number, string>;
  tiles: Tile[];
}

export interface World {
  phase: Phase;
  rand: () => number;
  catalog: Shlok[];
  milestone: number;
  groupsPerSet: number;
  set: Shlok[];
  index: number;
  puzzle: Puzzle | null;
  /** Blank word index → tile id. */
  filled: Map<number, number>;
  held: number | null;
  /** Blanks that already received a wrong word, so a later correct drop is not a first try. */
  missed: Set<number>;
  score: number;
  placed: number;
  wrong: number;
  time: number;
  /** Seconds left before the next shloka, or -1 while the puzzle is open. */
  advanceIn: number;
}

export interface Spot {
  id: number;
  x: number;
  y: number;
  hw: number;
  hh: number;
}

/** Shlokas in one sitting. Short on purpose. */
export const GROUPS_PER_SET = 3;
/** Extra reach around a tile or blank, in screen heights. Tracking jitters; kids pinch a little off. */
export const HIT_PAD = 0.055;
/** Pause on a finished shloka so the last word can be seen. */
export const SOLVE_HOLD_S = 1.15;
const BLANKS: Record<Shlok['groupType'], number> = { single: 3, 'multi-shlok': 4 };
const MIN_LETTERS = 4;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORD = /[^\s;:,.!?–—]+|[\s;:,.!?–—]+/g;

export function pieceVerse(text: string): Piece[] {
  const pieces: Piece[] = [];
  let wordIndex = -1;
  for (const m of text.matchAll(WORD)) {
    const chunk = m[0];
    if (/[^\s;:,.!?–—]/u.test(chunk)) {
      wordIndex++;
      pieces.push({ kind: 'word', text: chunk, wordIndex });
    } else pieces.push({ kind: 'gap', text: chunk, wordIndex: -1 });
  }
  return pieces;
}

function letters(word: string): number {
  return [...word].length;
}

function eligible(pieces: Piece[]): number[] {
  return pieces.filter((p) => p.kind === 'word' && letters(p.text) >= MIN_LETTERS && /\p{L}/u.test(p.text)).map((p) => p.wordIndex);
}

/** Spread blanks through the verse so they are not all clustered at the start. */
export function chooseBlanks(indexes: number[], count: number, rand: () => number): number[] {
  if (indexes.length === 0) return [];
  const n = Math.max(1, Math.min(count, indexes.length));
  const buckets: number[][] = Array.from({ length: n }, () => []);
  indexes.forEach((idx, i) => {
    buckets[Math.min(n - 1, Math.floor((i * n) / indexes.length))].push(idx);
  });
  return buckets.map((b) => b[Math.floor(rand() * b.length)]);
}

function shuffle<T>(list: T[], rand: () => number): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function wordsIn(text: string): string[] {
  return pieceVerse(text).filter((p) => p.kind === 'word' && letters(p.text) >= MIN_LETTERS).map((p) => p.text);
}

export function buildPuzzle(shlok: Shlok, pool: string[], rand: () => number, tileId = { n: 1 }): Puzzle {
  const pieces = pieceVerse(shlok.sanskrit);
  const blanks = chooseBlanks(eligible(pieces), BLANKS[shlok.groupType], rand).sort((a, b) => a - b);
  const byIndex = new Map(pieces.filter((p) => p.kind === 'word').map((p) => [p.wordIndex, p.text]));
  const expected = new Map(blanks.map((i) => [i, byIndex.get(i) ?? '']));
  const answers = new Set(expected.values());
  const distractors: string[] = [];
  for (const word of shuffle(pool.filter((w) => !answers.has(w)), rand)) {
    if (distractors.includes(word)) continue;
    distractors.push(word);
    if (distractors.length === 2) break;
  }
  const tiles = shuffle([
    ...blanks.map((answer) => ({ id: tileId.n++, word: expected.get(answer) ?? '', answer })),
    ...distractors.map((word) => ({ id: tileId.n++, word, answer: -1 })),
  ], rand);
  return { shlok, pieces, blanks, expected, tiles };
}

export function createWorld(catalog: Shlok[], seed = Date.now(), groupsPerSet = GROUPS_PER_SET): World {
  return {
    phase: 'title', rand: mulberry32(seed), catalog, milestone: 1, groupsPerSet,
    set: [], index: 0, puzzle: null, filled: new Map(), held: null, missed: new Set(),
    score: 0, placed: 0, wrong: 0, time: 0, advanceIn: -1,
  };
}

export function nextSet(catalog: Shlok[], milestone: number, done: Set<string>, groups: number): Shlok[] {
  const inM = catalog.filter((s) => s.milestone === milestone);
  const todo = inM.filter((s) => !done.has(s.shlokGroup));
  return (todo.length > 0 ? todo : inM).slice(0, Math.max(1, groups));
}

function poolFor(catalog: Shlok[], shlok: Shlok): string[] {
  const pool: string[] = [];
  for (const other of catalog) {
    if (other.milestone !== shlok.milestone || other.shlokGroup === shlok.shlokGroup) continue;
    pool.push(...wordsIn(other.sanskrit));
  }
  return pool;
}

export function loadPuzzle(w: World) {
  const shlok = w.set[w.index];
  w.puzzle = shlok ? buildPuzzle(shlok, poolFor(w.catalog, shlok), w.rand) : null;
  w.filled = new Map();
  w.held = null;
  w.missed = new Set();
  w.advanceIn = -1;
}

export function startSet(w: World, milestone: number, done: Set<string>) {
  w.milestone = milestone;
  w.set = nextSet(w.catalog, milestone, done, w.groupsPerSet);
  w.index = 0;
  w.score = 0;
  w.placed = 0;
  w.wrong = 0;
  w.time = 0;
  w.phase = 'play';
  loadPuzzle(w);
}

export function milestones(catalog: Shlok[]) {
  return milestoneSummary(catalog);
}

/** Nearest spot whose box, grown by HIT_PAD, contains the point. */
export function hitSpot(spots: Spot[], x: number, y: number, aspect: number): Spot | null {
  let best: Spot | null = null;
  let bestD = Infinity;
  for (const s of spots) {
    const hx = s.hw + HIT_PAD / Math.max(aspect, 0.01);
    const hy = s.hh + HIT_PAD;
    const dx = Math.abs(s.x - x);
    const dy = Math.abs(s.y - y);
    if (dx <= hx && dy <= hy) {
      const d = Math.hypot((s.x - x) * aspect, s.y - y);
      if (d < bestD) { best = s; bestD = d; }
    }
  }
  return best;
}

export function press(w: World, x: number, y: number, tiles: Spot[], aspect: number): boolean {
  if (w.phase !== 'play' || !w.puzzle || w.held !== null || w.advanceIn >= 0) return false;
  const placed = new Set(w.filled.values());
  const open = tiles.filter((s) => !placed.has(s.id));
  const spot = hitSpot(open, x, y, aspect);
  if (!spot) return false;
  w.held = spot.id;
  return true;
}

export type Drop = 'correct' | 'wrong' | 'cancel';

export function release(w: World, x: number, y: number, blanks: Spot[], aspect: number): Drop | null {
  if (w.phase !== 'play' || !w.puzzle || w.held === null) return null;
  const tile = w.puzzle.tiles.find((t) => t.id === w.held);
  w.held = null;
  if (!tile) return null;
  const open = blanks.filter((s) => !w.filled.has(s.id));
  const spot = hitSpot(open, x, y, aspect);
  if (!spot) return 'cancel';
  const want = w.puzzle.expected.get(spot.id);
  if (want && tile.word === want) {
    w.filled.set(spot.id, tile.id);
    if (!w.missed.has(spot.id)) w.score++;
    w.placed++;
    if (w.filled.size === w.puzzle.blanks.length) w.advanceIn = SOLVE_HOLD_S;
    return 'correct';
  }
  w.missed.add(spot.id);
  w.wrong++;
  return 'wrong';
}

/** Returns 'results' when the set ends, 'advance' when the next shloka appears. */
export function step(w: World, dt: number): 'advance' | 'results' | null {
  if (w.phase !== 'play') return null;
  w.time += dt;
  if (w.advanceIn < 0) return null;
  w.advanceIn -= dt;
  if (w.advanceIn > 0) return null;
  w.index += 1;
  if (w.index >= w.set.length) {
    w.phase = 'results';
    w.advanceIn = -1;
    w.held = null;
    return 'results';
  }
  loadPuzzle(w);
  return 'advance';
}

export function blanksLeft(w: World): number {
  if (!w.puzzle) return 0;
  return w.puzzle.blanks.length - w.filled.size;
}
