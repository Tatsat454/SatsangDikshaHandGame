import { describe, expect, it } from 'vitest';
import { SHLOKAS, milestoneSummary, parseShlokas } from '../src/shlokas';
import {
  buildPuzzle, chooseBlanks, createWorld, hitSpot, loadPuzzle, mulberry32, nextSet,
  press, release, startSet, step, type Spot,
} from '../src/rules';

const spot = (id: number, x: number, y: number): Spot => ({ id, x, y, hw: 0.04, hh: 0.03 });

describe('shlokas', () => {
  it('reads the book table, including grouped shlokas', () => {
    expect(SHLOKAS.length).toBeGreaterThan(250);
    expect(SHLOKAS[0].shlokNumber).toBe('1');
    expect(SHLOKAS[0].sanskrit.startsWith('Swāminārāyaṇah')).toBe(true);
    expect(SHLOKAS[0].gujarati.length).toBeGreaterThan(10);
    expect(SHLOKAS[0].english.length).toBeGreaterThan(10);
    const grouped = SHLOKAS.find((s) => s.groupType === 'multi-shlok');
    expect(grouped?.shlokGroup).toBe('4-5');
    expect(grouped?.sanskrit).toContain('\n');
    expect(milestoneSummary(SHLOKAS)).toHaveLength(13);
  });

  it('keeps a quoted comma inside a cell', () => {
    const rows = parseShlokas('shlok_number,shlok_group,group_type,milestone,sanskrit_transliteration,gujarati_transliteration,english_translation,pdf_page\n1,1,single,1,Aaa bbbb cccc,,"Hello, world",9\n');
    expect(rows[0].english).toBe('Hello, world');
  });
});

describe('rules', () => {
  it('the same seed blanks the same words', () => {
    const a = buildPuzzle(SHLOKAS[0], [], mulberry32(3));
    const b = buildPuzzle(SHLOKAS[0], [], mulberry32(3));
    expect(a.blanks).toEqual(b.blanks);
    expect(a.tiles.map((t) => t.word)).toEqual(b.tiles.map((t) => t.word));
  });

  it('a single shloka blanks fewer words than a group when both are long', () => {
    const rand = mulberry32(2);
    const single = SHLOKAS.find((s) => s.groupType === 'single' && s.sanskrit.split(/\s+/).length > 12)!;
    const group = SHLOKAS.find((s) => s.groupType === 'multi-shlok')!;
    expect(buildPuzzle(single, [], rand).blanks.length).toBeLessThanOrEqual(3);
    expect(buildPuzzle(group, [], mulberry32(2)).blanks.length).toBe(4);
  });

  it('spreads blanks instead of taking the first words only', () => {
    const picked = chooseBlanks([0, 1, 2, 3, 4, 5, 6, 7, 8], 3, mulberry32(1));
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
    expect(Math.max(...picked) - Math.min(...picked)).toBeGreaterThan(3);
  });

  it('a pinch on a tile and a release on its blank fills it and scores', () => {
    const w = createWorld(SHLOKAS, 3, 1);
    startSet(w, 1, new Set());
    const tile = w.puzzle!.tiles.find((t) => t.answer >= 0)!;
    const tiles = [spot(tile.id, 0.3, 0.8)];
    const blanks = [spot(tile.answer, 0.55, 0.4)];
    expect(press(w, 0.9, 0.9, tiles, 1.6)).toBe(false);
    expect(press(w, 0.3, 0.8, tiles, 1.6)).toBe(true);
    expect(release(w, 0.55, 0.42, blanks, 1.6)).toBe('correct');
    expect(w.filled.get(tile.answer)).toBe(tile.id);
    expect(w.score).toBe(1);
    expect(w.placed).toBe(1);
  });

  it('a wrong word bounces, and the later correct drop is not a first try', () => {
    const w = createWorld(SHLOKAS, 5, 1);
    startSet(w, 1, new Set());
    const good = w.puzzle!.tiles.find((t) => t.answer >= 0)!;
    const bad = w.puzzle!.tiles.find((t) => t.answer < 0) ?? { ...good, id: 99, word: 'nope', answer: -1 };
    if (!w.puzzle!.tiles.some((t) => t.id === bad.id)) w.puzzle!.tiles.push(bad);
    const blanks = [spot(good.answer, 0.5, 0.4)];
    press(w, 0.2, 0.8, [spot(bad.id, 0.2, 0.8)], 1.6);
    expect(release(w, 0.5, 0.4, blanks, 1.6)).toBe('wrong');
    expect(w.score).toBe(0);
    press(w, 0.2, 0.8, [spot(good.id, 0.2, 0.8)], 1.6);
    expect(release(w, 0.5, 0.4, blanks, 1.6)).toBe('correct');
    expect(w.score).toBe(0);
    expect(w.placed).toBe(1);
  });

  it('a drop in empty space puts the word back', () => {
    const w = createWorld(SHLOKAS, 1, 1);
    startSet(w, 1, new Set());
    const tile = w.puzzle!.tiles[0];
    press(w, 0.2, 0.8, [spot(tile.id, 0.2, 0.8)], 1.6);
    expect(release(w, 0.1, 0.1, [spot(0, 0.8, 0.8)], 1.6)).toBe('cancel');
    expect(w.held).toBeNull();
    expect(w.filled.size).toBe(0);
  });

  it('finishing the blanks ends a one-shloka set', () => {
    const w = createWorld(SHLOKAS, 7, 1);
    startSet(w, 1, new Set());
    for (const id of w.puzzle!.blanks) {
      const tile = w.puzzle!.tiles.find((t) => t.answer === id)!;
      press(w, 0.2, 0.2, [spot(tile.id, 0.2, 0.2)], 1);
      release(w, 0.5, 0.5, [spot(id, 0.5, 0.5)], 1);
    }
    expect(w.filled.size).toBe(w.puzzle!.blanks.length);
    let phase = 'play';
    for (let i = 0; i < 90; i++) phase = step(w, 1 / 60) ?? phase;
    expect(w.phase).toBe('results');
  });

  it('progress skips shlok groups that are already done', () => {
    const first = SHLOKAS.filter((s) => s.milestone === 1);
    const done = new Set(first.slice(0, 2).map((s) => s.shlokGroup));
    const set = nextSet(SHLOKAS, 1, done, 3);
    expect(set.map((s) => s.shlokGroup)).toEqual(first.slice(2, 5).map((s) => s.shlokGroup));
    const w = createWorld(SHLOKAS, 1, 3);
    startSet(w, 2, new Set(SHLOKAS.filter((s) => s.milestone === 2).map((s) => s.shlokGroup)));
    expect(w.set[0].milestone).toBe(2);
    loadPuzzle(w);
    expect(w.puzzle?.shlok.shlokGroup).toBe(w.set[0].shlokGroup);
  });

  it('the hit area reaches a little past the tile', () => {
    const tiles = [spot(1, 0.5, 0.5)];
    expect(hitSpot(tiles, 0.5, 0.5 + 0.03 + 0.04, 1.6)?.id).toBe(1);
    expect(hitSpot(tiles, 0.5, 0.5 + 0.2, 1.6)).toBeNull();
  });

  it('every shloka can be made into a puzzle', () => {
    const rand = mulberry32(9);
    for (const s of SHLOKAS) {
      const p = buildPuzzle(s, ['deho', 'mukter', 'satsangah'], rand);
      expect(p.blanks.length).toBeGreaterThan(0);
      expect(p.tiles.filter((t) => t.answer >= 0)).toHaveLength(p.blanks.length);
    }
  });
});
