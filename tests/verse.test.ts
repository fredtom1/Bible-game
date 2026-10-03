import { describe, expect, it } from 'vitest';
import {
  chunkVerse,
  makeFillPuzzle,
  mistakeStars,
  mulberry32,
  normalizeWord,
  scoreRecitation,
  shuffleNotIdentity,
  tokenize,
  wordsMatch,
} from '../src/logic/verse';
import { VERSES } from '../src/content/verses';

describe('normalisation', () => {
  it('strips punctuation, curly apostrophes and case', () => {
    expect(normalizeWord('Haven’t')).toBe('havent');
    expect(normalizeWord('“Don’t')).toBe('dont');
    expect(normalizeWord('LORD,')).toBe('lord');
  });

  it('treats Yahweh and LORD as the same word', () => {
    expect(tokenize('Yahweh will fight')).toEqual(['lord', 'will', 'fight']);
  });
});

describe('scoreRecitation', () => {
  const web = VERSES['exodus-14-14'].text.WEB;

  it('gives a perfect score for an exact recitation', () => {
    const r = scoreRecitation(web, web);
    expect(r.accuracy).toBe(1);
    expect(r.stars).toBe(3);
    expect(r.passed).toBe(true);
  });

  it('accepts "the Lord" for Yahweh and ignores punctuation', () => {
    const r = scoreRecitation(web, 'the lord will fight for you and you shall be still');
    expect(r.accuracy).toBeGreaterThanOrEqual(0.95);
  });

  it('tolerates speech-recognition slips on archaic words', () => {
    const kjv = VERSES['1-samuel-16-7'].text.KJV;
    const r = scoreRecitation(kjv, 'for man looked on the outward appearance but the lord looketh on the heart');
    expect(r.stars).toBeGreaterThanOrEqual(2);
  });

  it('fails an unrelated attempt', () => {
    const r = scoreRecitation(web, 'in the beginning God created the heavens');
    expect(r.passed).toBe(false);
  });

  it('marks which words were missed', () => {
    const r = scoreRecitation('Be strong and courageous', 'be strong courageous');
    expect(r.matched).toEqual([true, true, false, true]);
  });

  it('penalises padding the answer with extra words', () => {
    const padded = `${web} ${'banana '.repeat(30)}`;
    expect(scoreRecitation(web, padded).accuracy).toBeLessThan(0.5);
  });

  it('does not treat short different words as equal', () => {
    expect(wordsMatch('me', 'my')).toBe(false);
    expect(wordsMatch('thee', 'the')).toBe(true);
  });
});

describe('puzzles', () => {
  it('chunks every verse without losing words', () => {
    for (const v of Object.values(VERSES)) {
      for (const t of ['WEB', 'KJV'] as const) {
        const chunks = chunkVerse(v.text[t]);
        expect(chunks.join(' ')).toBe(v.text[t].split(/\s+/).join(' '));
        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks.every((c) => c.split(' ').length <= 5)).toBe(true);
      }
    }
  });

  it('builds fill-in puzzles with the answer among four options', () => {
    const rng = mulberry32(7);
    for (const v of Object.values(VERSES)) {
      const p = makeFillPuzzle(v.text.WEB, 3, rng);
      expect(p.blanks.length).toBe(3);
      for (const b of p.blanks) {
        expect(b.options).toContain(b.answer);
        expect(b.options.length).toBe(4);
        expect(new Set(b.options.map((o) => o.toLowerCase())).size).toBe(4);
      }
    }
  });

  it('never returns the tiles already in order', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 50; i++) {
      const items = ['a', 'b', 'c'];
      expect(shuffleNotIdentity(items, rng)).not.toEqual(items);
    }
  });

  it('awards stars by mistakes', () => {
    expect(mistakeStars(0)).toBe(3);
    expect(mistakeStars(2)).toBe(2);
    expect(mistakeStars(5)).toBe(1);
  });
});
