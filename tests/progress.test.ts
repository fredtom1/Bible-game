import { describe, expect, it } from 'vitest';
import {
  ERA_ORDER,
  isEraUnlocked,
  loadSave,
  newSave,
  parseSave,
  rankFor,
  recordEraResult,
  recordVerse,
  touchStreak,
  writeSave,
} from '../src/logic/progress';

describe('save parsing', () => {
  it('returns a fresh save for junk', () => {
    expect(parseSave('not json').xp).toBe(0);
    expect(parseSave(null).profile).toBeNull();
    expect(parseSave('{"version":99}').version).toBe(1);
  });

  it('fills in settings added after the save was written', () => {
    const s = parseSave(JSON.stringify({ version: 1, xp: 50, settings: { music: 0.1 } }));
    expect(s.xp).toBe(50);
    expect(s.settings.music).toBe(0.1);
    expect(s.settings.sfx).toBeGreaterThan(0);
  });

  it('round-trips through storage', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const s = { ...newSave(), xp: 123 };
    writeSave(storage, s);
    expect(loadSave(storage).xp).toBe(123);
  });
});

describe('unlocks', () => {
  it('opens the first era after the tutorial and each era after the previous one', () => {
    let s = newSave();
    expect(isEraUnlocked(s, 'flood')).toBe(false);
    s = { ...s, tutorialDone: true };
    expect(isEraUnlocked(s, 'flood')).toBe(true);
    expect(isEraUnlocked(s, 'redsea')).toBe(false);
    s = recordEraResult(s, 'flood', { stars: 2, score: 100, fragments: ['a'], quizCorrect: 1 });
    expect(isEraUnlocked(s, 'redsea')).toBe(true);
    expect(isEraUnlocked(s, 'jericho')).toBe(false);
  });

  it('youth-leader mode unlocks everything', () => {
    const s = newSave();
    s.settings.unlockAll = true;
    expect(ERA_ORDER.every((id) => isEraUnlocked(s, id))).toBe(true);
  });

  it('keeps personal bests and merges fragments', () => {
    let s = recordEraResult(newSave(), 'flood', { stars: 3, score: 500, fragments: ['a'], quizCorrect: 2 });
    s = recordEraResult(s, 'flood', { stars: 1, score: 200, fragments: ['b'], quizCorrect: 0 });
    expect(s.eras.flood).toEqual({ completed: true, bestStars: 3, fragments: ['a', 'b'], quizBest: 2, bestScore: 500 });
    expect(s.badges).toEqual(['era:flood']);
  });
});

describe('ranks, verses and streaks', () => {
  it('computes rank progress', () => {
    expect(rankFor(0).rank.title).toBe('Seeker');
    expect(rankFor(400).rank.title).toBe('Wayfarer');
    expect(rankFor(700).progress).toBeCloseTo(0.5);
    expect(rankFor(99999).next).toBeNull();
  });

  it('records verse practice', () => {
    let s = recordVerse(newSave(), 'john-3-16', 2, 1);
    s = recordVerse(s, 'john-3-16', 1, 2);
    expect(s.verses['john-3-16']).toEqual({ learned: true, bestStars: 2, practiced: 2, lastPracticed: 2 });
  });

  it('counts consecutive days and resets after a gap', () => {
    let s = touchStreak(newSave(), new Date(2026, 0, 1));
    s = touchStreak(s, new Date(2026, 0, 2));
    s = touchStreak(s, new Date(2026, 0, 2));
    expect(s.streak.count).toBe(2);
    s = touchStreak(s, new Date(2026, 0, 5));
    expect(s.streak.count).toBe(1);
  });
});
