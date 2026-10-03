/**
 * Memory-verse logic: normalising text, scoring a recitation (typed or spoken),
 * and generating the "build it" and "fill the gaps" puzzles.
 * Pure functions only, so they are easy to unit test.
 */

export type Rng = () => number;

/** Lower-case, strip punctuation and apostrophes: “Haven’t” -> "havent". */
export function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Map words that mean the same thing in either translation to one form. */
const CANONICAL: Record<string, string> = {
  yahweh: 'lord',
  jehovah: 'lord',
  yahway: 'lord',
  yaweh: 'lord',
};

function canonical(word: string): string {
  return CANONICAL[word] ?? word;
}

export function tokenize(text: string): string[] {
  return text
    .split(/[\s—–-]+/)
    .map(normalizeWord)
    .filter((w) => w.length > 0)
    .map(canonical);
}

/** Display words with their punctuation kept, split on whitespace. */
export function displayWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/**
 * Lenient word match. Speech recognisers often mishear archaic or rare words
 * ("thee" -> "the", "looketh" -> "looked"), so allow small edit distances that
 * scale with word length.
 */
export function wordsMatch(expected: string, got: string): boolean {
  if (expected === got) return true;
  const len = Math.max(expected.length, got.length);
  const allowed = len <= 3 ? 1 : len <= 8 ? 2 : 3;
  if (len <= 2) return false;
  return levenshtein(expected, got) <= allowed;
}

export interface RecitationResult {
  /** 0..1 share of the verse's words recited in order. */
  accuracy: number;
  /** Per expected word: was it matched? */
  matched: boolean[];
  stars: 0 | 1 | 2 | 3;
  passed: boolean;
}

/**
 * Compare a recitation with the verse using an in-order fuzzy alignment
 * (longest common subsequence with lenient word equality).
 */
export function scoreRecitation(expectedText: string, attempt: string): RecitationResult {
  const exp = tokenize(expectedText);
  const got = tokenize(attempt);
  const n = exp.length;
  const m = got.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = wordsMatch(exp[i - 1], got[j - 1])
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const matched = new Array<boolean>(n).fill(false);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (wordsMatch(exp[i - 1], got[j - 1]) && dp[i][j] === dp[i - 1][j - 1] + 1) {
      matched[i - 1] = true;
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  const hits = dp[n][m];
  let accuracy = n === 0 ? 0 : hits / n;
  // Penalise padding the answer with lots of extra words.
  if (m > n * 1.25 && m > 0) accuracy *= (n * 1.25) / m;
  accuracy = Math.max(0, Math.min(1, accuracy));
  const stars = accuracyStars(accuracy);
  return { accuracy, matched, stars, passed: stars > 0 };
}

export function accuracyStars(accuracy: number): 0 | 1 | 2 | 3 {
  if (accuracy >= 0.95) return 3;
  if (accuracy >= 0.85) return 2;
  if (accuracy >= 0.7) return 1;
  return 0;
}

export function mistakeStars(mistakes: number): 1 | 2 | 3 {
  if (mistakes <= 0) return 3;
  if (mistakes <= 2) return 2;
  return 1;
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const k = Math.floor(rng() * (i + 1));
    [a[i], a[k]] = [a[k], a[i]];
  }
  return a;
}

/** Shuffle, but never hand back the original order (when that is possible). */
export function shuffleNotIdentity<T>(items: readonly T[], rng: Rng): T[] {
  if (items.length < 2) return items.slice();
  for (let attempt = 0; attempt < 8; attempt++) {
    const s = shuffle(items, rng);
    if (s.some((v, idx) => v !== items[idx])) return s;
  }
  const s = items.slice();
  [s[0], s[1]] = [s[1], s[0]];
  return s;
}

/**
 * Break a verse into phrase tiles for the "build it" puzzle. Breaks after
 * punctuation or after `maxWords` words, and never leaves a lonely last word.
 */
export function chunkVerse(text: string, maxWords = 4): string[] {
  const words = displayWords(text);
  const chunks: string[][] = [];
  let cur: string[] = [];
  for (const w of words) {
    cur.push(w);
    if (/[,.;:?!]["”’)]*$/.test(w) || cur.length >= maxWords) {
      chunks.push(cur);
      cur = [];
    }
  }
  if (cur.length) chunks.push(cur);
  if (chunks.length > 1 && chunks[chunks.length - 1].length === 1) {
    const last = chunks.pop()!;
    chunks[chunks.length - 1].push(...last);
  }
  return chunks.map((c) => c.join(' '));
}

const STOPWORDS = new Set([
  'the', 'and', 'that', 'for', 'you', 'thee', 'thy', 'with', 'have', 'has', 'hath', 'his', 'her', 'are',
  'but', 'not', 'will', 'shall', 'this', 'from', 'into', 'unto', 'him', 'them', 'they', 'who', 'whoever',
  'even', 'than', 'then', 'there', 'their', 'what', 'when', 'your', 'mine', 'might',
]);

const DISTRACTORS = [
  'light', 'river', 'stone', 'grace', 'truth', 'mountain', 'faith', 'peace', 'kingdom', 'power',
  'glory', 'fire', 'water', 'bread', 'shepherd', 'heaven', 'mercy', 'joy', 'path', 'voice', 'promise',
  'strength', 'wisdom', 'hope', 'city', 'storm', 'morning', 'treasure',
];

export interface FillBlank {
  index: number;
  answer: string;
  options: string[];
}

export interface FillPuzzle {
  words: string[];
  blanks: FillBlank[];
}

function stripPunct(word: string): string {
  return word.replace(/^[“"‘'(]+|[,.;:?!”"’')]+$/g, '');
}

/** Hide `count` key words of the verse and offer four choices for each. */
export function makeFillPuzzle(text: string, count: number, rng: Rng): FillPuzzle {
  const words = displayWords(text);
  const candidates = words
    .map((w, index) => ({ index, core: stripPunct(w) }))
    .filter((c) => normalizeWord(c.core).length >= 4 && !STOPWORDS.has(normalizeWord(c.core)));
  const chosen = shuffle(candidates, rng)
    .slice(0, Math.min(count, candidates.length))
    .sort((a, b) => a.index - b.index);
  const pool = Array.from(
    new Set(
      words
        .map(stripPunct)
        .filter((w) => normalizeWord(w).length >= 3)
        .concat(DISTRACTORS),
    ),
  );
  const blanks: FillBlank[] = chosen.map(({ index, core }) => {
    const wrong = shuffle(
      pool.filter((w) => normalizeWord(w) !== normalizeWord(core)),
      rng,
    ).slice(0, 3);
    return { index, answer: core, options: shuffle([core, ...wrong], rng) };
  });
  return { words, blanks };
}

/** Deterministic PRNG so puzzles are reproducible in tests. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
