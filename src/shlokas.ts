/**
 * Satsang Diksha shlokas, parsed from the book numbering CSV. The Sanskrit transliteration is the
 * verse the player completes. Gujarati and English are support, not the puzzle.
 */
import raw from '../data/satsang-diksha-book-numbering.csv?raw';

export type GroupType = 'single' | 'multi-shlok';

export interface Shlok {
  shlokNumber: string;
  shlokGroup: string;
  groupType: GroupType;
  milestone: number;
  sanskrit: string;
  gujarati: string;
  english: string;
  pdfPage: string;
}

/** A small CSV reader that keeps quoted newlines, which the Sanskrit of grouped shlokas uses. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

export function parseShlokas(text: string): Shlok[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const col = (name: string) => header.findIndex((h) => h.replace(/^\uFEFF/, '').trim() === name);
  const iNum = col('shlok_number');
  const iGroup = col('shlok_group');
  const iType = col('group_type');
  const iMile = col('milestone');
  const iSans = col('sanskrit_transliteration');
  const iGuj = col('gujarati_transliteration');
  const iEng = col('english_translation');
  const iPage = col('pdf_page');
  return rows.map((r) => {
    const groupType: GroupType = r[iType]?.trim() === 'multi-shlok' ? 'multi-shlok' : 'single';
    return {
      shlokNumber: (r[iNum] ?? '').trim(),
      shlokGroup: (r[iGroup] ?? '').trim(),
      groupType,
      milestone: Number(r[iMile]) || 0,
      sanskrit: (r[iSans] ?? '').trim(),
      gujarati: (r[iGuj] ?? '').trim(),
      english: (r[iEng] ?? '').trim(),
      pdfPage: (r[iPage] ?? '').trim(),
    };
  }).filter((s) => s.sanskrit && s.shlokGroup);
}

export const SHLOKAS: Shlok[] = parseShlokas(raw);

export function milestoneSummary(list: Shlok[]): { milestone: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const s of list) counts.set(s.milestone, (counts.get(s.milestone) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([milestone, count]) => ({ milestone, count }));
}

export function groupLabel(type: GroupType): string {
  return type === 'single' ? 'Single shloka' : 'Shloka group';
}
