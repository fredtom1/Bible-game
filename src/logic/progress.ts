/**
 * Save data, XP/ranks and unlock rules. Pure data + functions; persistence is
 * done by the caller through a tiny storage interface so it can be tested.
 */
import type { Translation } from '../content/verses';

export const ERA_ORDER = ['flood', 'redsea', 'jericho', 'david', 'daniel', 'loaves', 'tomb'] as const;
export type EraId = (typeof ERA_ORDER)[number];

export type HairStyle = 'short' | 'long' | 'puffs' | 'braids' | 'bald' | 'afro';
export type Headwear = 'none' | 'headwrap' | 'hood' | 'veil' | 'keffiyeh';

export interface AvatarConfig {
  skin: string;
  hairStyle: HairStyle;
  hairColor: string;
  outfit: string;
  accent: string;
  headwear: Headwear;
}

export interface Profile {
  name: string;
  avatar: AvatarConfig;
  translation: Translation;
  createdAt: number;
}

export interface EraProgress {
  completed: boolean;
  bestStars: number;
  fragments: string[];
  quizBest: number;
  bestScore: number;
}

export interface VerseProgress {
  learned: boolean;
  bestStars: number;
  practiced: number;
  lastPracticed?: number;
}

export type Quality = 'auto' | 'low' | 'medium' | 'high';

export interface Settings {
  music: number;
  sfx: number;
  narrator: boolean;
  quality: Quality;
  largeText: boolean;
  reduceMotion: boolean;
  unlockAll: boolean;
}

export interface SaveData {
  version: 1;
  profile: Profile | null;
  tutorialDone: boolean;
  xp: number;
  eras: Partial<Record<EraId, EraProgress>>;
  verses: Record<string, VerseProgress>;
  badges: string[];
  settings: Settings;
  streak: { lastDay: string; count: number };
  finaleSeen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  music: 0.6,
  sfx: 0.8,
  narrator: false,
  quality: 'auto',
  largeText: false,
  reduceMotion: false,
  unlockAll: false,
};

export function newSave(): SaveData {
  return {
    version: 1,
    profile: null,
    tutorialDone: false,
    xp: 0,
    eras: {},
    verses: {},
    badges: [],
    settings: { ...DEFAULT_SETTINGS },
    streak: { lastDay: '', count: 0 },
    finaleSeen: false,
  };
}

/** Accept anything from storage and return a valid save (never throws). */
export function parseSave(raw: string | null): SaveData {
  if (!raw) return newSave();
  try {
    const data = JSON.parse(raw) as Partial<SaveData>;
    if (!data || typeof data !== 'object' || data.version !== 1) return newSave();
    const base = newSave();
    return {
      ...base,
      ...data,
      settings: { ...base.settings, ...(data.settings ?? {}) },
      streak: { ...base.streak, ...(data.streak ?? {}) },
      eras: data.eras ?? {},
      verses: data.verses ?? {},
      badges: Array.isArray(data.badges) ? data.badges : [],
      xp: typeof data.xp === 'number' && Number.isFinite(data.xp) ? data.xp : 0,
    };
  } catch {
    return newSave();
  }
}

export function eraProgress(save: SaveData, id: EraId): EraProgress {
  return save.eras[id] ?? { completed: false, bestStars: 0, fragments: [], quizBest: 0, bestScore: 0 };
}

export function isEraUnlocked(save: SaveData, id: EraId): boolean {
  if (save.settings.unlockAll) return true;
  const idx = ERA_ORDER.indexOf(id);
  if (idx === 0) return save.tutorialDone;
  return eraProgress(save, ERA_ORDER[idx - 1]).completed;
}

export function completedCount(save: SaveData): number {
  return ERA_ORDER.filter((id) => eraProgress(save, id).completed).length;
}

export interface Rank {
  title: string;
  minXp: number;
}

export const RANKS: Rank[] = [
  { title: 'Seeker', minXp: 0 },
  { title: 'Wayfarer', minXp: 400 },
  { title: 'Pathfinder', minXp: 1000 },
  { title: 'Scroll-bearer', minXp: 1800 },
  { title: 'Torchbearer', minXp: 2800 },
  { title: 'Timewalker', minXp: 4000 },
];

export function rankFor(xp: number): { rank: Rank; next: Rank | null; progress: number } {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].minXp) i++;
  const rank = RANKS[i];
  const next = RANKS[i + 1] ?? null;
  const progress = next ? (xp - rank.minXp) / (next.minXp - rank.minXp) : 1;
  return { rank, next, progress: Math.max(0, Math.min(1, progress)) };
}

export interface EraResult {
  stars: number;
  score: number;
  fragments: string[];
  quizCorrect: number;
}

/** Merge an era run into the save, keeping personal bests. */
export function recordEraResult(save: SaveData, id: EraId, result: EraResult): SaveData {
  const prev = eraProgress(save, id);
  const fragments = Array.from(new Set([...prev.fragments, ...result.fragments]));
  const next: EraProgress = {
    completed: true,
    bestStars: Math.max(prev.bestStars, result.stars),
    fragments,
    quizBest: Math.max(prev.quizBest, result.quizCorrect),
    bestScore: Math.max(prev.bestScore, result.score),
  };
  const badges = save.badges.includes(`era:${id}`) ? save.badges : [...save.badges, `era:${id}`];
  return { ...save, eras: { ...save.eras, [id]: next }, badges };
}

export function recordVerse(save: SaveData, verseId: string, stars: number, now: number): SaveData {
  const prev = save.verses[verseId] ?? { learned: false, bestStars: 0, practiced: 0 };
  const next: VerseProgress = {
    learned: prev.learned || stars > 0,
    bestStars: Math.max(prev.bestStars, stars),
    practiced: prev.practiced + 1,
    lastPracticed: now,
  };
  return { ...save, verses: { ...save.verses, [verseId]: next } };
}

export function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Daily streak: +1 on a new consecutive day, reset after a missed day. */
export function touchStreak(save: SaveData, now: Date): SaveData {
  const today = dayKey(now);
  if (save.streak.lastDay === today) return save;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const count = save.streak.lastDay === dayKey(y) ? save.streak.count + 1 : 1;
  return { ...save, streak: { lastDay: today, count } };
}

export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SAVE_KEY = 'scrollgate-save-v1';

export function loadSave(storage: Storage | null): SaveData {
  try {
    return parseSave(storage?.getItem(SAVE_KEY) ?? null);
  } catch {
    return newSave();
  }
}

export function writeSave(storage: Storage | null, save: SaveData): void {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* storage full or blocked: the game still works for this session */
  }
}
