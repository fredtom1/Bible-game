import type { MusicTheme } from '../engine/Audio';
import type { Stage } from '../world/Stage';
import type { EraId } from '../logic/progress';

/** Every era is a lazily-loaded module implementing this contract. */
export interface EraModule {
  music: MusicTheme;
  atmosphere: string;
  /** Build the world and place the player (runs behind the time-warp). */
  setup(stage: Stage): void;
  /** Run the story. Resolves with mini-game performance stars (1-3). */
  play(stage: Stage): Promise<number>;
}

export const ERA_LOADERS: Record<EraId, () => Promise<{ default: EraModule }>> = {
  flood: () => import('./eras/flood'),
  redsea: () => import('./eras/redsea'),
  jericho: () => import('./eras/jericho'),
  david: () => import('./eras/david'),
  daniel: () => import('./eras/daniel'),
  loaves: () => import('./eras/loaves'),
  tomb: () => import('./eras/tomb'),
};
