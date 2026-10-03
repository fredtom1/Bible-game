import { HUD } from './hud';
import { StoryUI } from './story';

/** Root of the DOM overlay: HUD, story widgets and modal bookkeeping. */
export class UI {
  readonly hud: HUD;
  readonly story: StoryUI;
  private modals = 0;

  constructor(readonly root: HTMLElement, handlers: { onPause: () => void; onJournal: () => void }) {
    this.hud = new HUD(root, handlers);
    this.story = new StoryUI(root);
  }

  /** True while dialogue or any modal is open (gameplay input is ignored). */
  get busy(): boolean {
    return this.story.busy || this.modals > 0;
  }

  /** Track a modal promise so `busy` is accurate while it is open. */
  async modal<T>(p: Promise<T>): Promise<T> {
    this.modals++;
    try {
      return await p;
    } finally {
      this.modals--;
    }
  }

  applyPrefs(largeText: boolean, reduceMotion: boolean): void {
    document.documentElement.classList.toggle('large-text', largeText);
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }
}
