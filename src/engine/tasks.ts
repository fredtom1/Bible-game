/**
 * Game-time scheduling for story scripts. Every wait/tween belongs to a
 * TaskRunner; aborting the runner rejects every pending promise with an
 * AbortError so an era's async script unwinds cleanly when the player leaves.
 */

export class AbortError extends Error {
  constructor() {
    super('aborted');
    this.name = 'AbortError';
  }
}

export const isAbort = (e: unknown): boolean => e instanceof AbortError || (e instanceof Error && e.name === 'AbortError');

export type Ease = (t: number) => number;

export const Ease = {
  linear: (t: number) => t,
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  in: (t: number) => t * t * t,
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  sine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
};

interface Pending {
  resolve: () => void;
  reject: (e: unknown) => void;
}

interface Wait extends Pending {
  until: number;
}

interface Cond extends Pending {
  pred: () => boolean;
}

interface TweenJob extends Pending {
  start: number;
  duration: number;
  fn: (t: number) => void;
  ease: Ease;
}

export class TaskRunner {
  time = 0;
  private waits: Wait[] = [];
  private conds: Cond[] = [];
  private tweens: TweenJob[] = [];
  private updaters = new Set<(dt: number, time: number) => void>();
  private aborted = false;

  update(dt: number): void {
    if (this.aborted) return;
    this.time += dt;
    for (const fn of Array.from(this.updaters)) fn(dt, this.time);
    if (this.tweens.length) {
      const done: TweenJob[] = [];
      for (const tw of this.tweens) {
        const t = Math.min(1, (this.time - tw.start) / tw.duration);
        tw.fn(tw.ease(t));
        if (t >= 1) done.push(tw);
      }
      if (done.length) {
        this.tweens = this.tweens.filter((t) => !done.includes(t));
        done.forEach((d) => d.resolve());
      }
    }
    if (this.waits.length) {
      const due = this.waits.filter((w) => w.until <= this.time);
      if (due.length) {
        this.waits = this.waits.filter((w) => w.until > this.time);
        due.forEach((w) => w.resolve());
      }
    }
    if (this.conds.length) {
      const ready = this.conds.filter((c) => c.pred());
      if (ready.length) {
        this.conds = this.conds.filter((c) => !ready.includes(c));
        ready.forEach((c) => c.resolve());
      }
    }
  }

  get isAborted(): boolean {
    return this.aborted;
  }

  wait(seconds: number): Promise<void> {
    if (this.aborted) return Promise.reject(new AbortError());
    return new Promise((resolve, reject) => this.waits.push({ until: this.time + seconds, resolve, reject }));
  }

  waitUntil(pred: () => boolean): Promise<void> {
    if (this.aborted) return Promise.reject(new AbortError());
    if (pred()) return Promise.resolve();
    return new Promise((resolve, reject) => this.conds.push({ pred, resolve, reject }));
  }

  tween(duration: number, fn: (t: number) => void, ease: Ease = Ease.inOut): Promise<void> {
    if (this.aborted) return Promise.reject(new AbortError());
    if (duration <= 0) {
      fn(1);
      return Promise.resolve();
    }
    fn(ease(0));
    return new Promise((resolve, reject) =>
      this.tweens.push({ start: this.time, duration, fn, ease, resolve, reject }),
    );
  }

  /** Register a per-frame callback; returns an unsubscribe function. */
  onUpdate(fn: (dt: number, time: number) => void): () => void {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  /** Wrap any promise so it rejects if the runner is aborted first. */
  guard<T>(p: Promise<T>): Promise<T> {
    if (this.aborted) return Promise.reject(new AbortError());
    return new Promise<T>((resolve, reject) => {
      const pending: Cond = { pred: () => false, resolve: () => undefined, reject };
      this.conds.push(pending);
      p.then(
        (v) => {
          this.conds = this.conds.filter((c) => c !== pending);
          if (!this.aborted) resolve(v);
        },
        (e) => {
          this.conds = this.conds.filter((c) => c !== pending);
          if (!this.aborted) reject(e);
        },
      );
    });
  }

  abort(): void {
    if (this.aborted) return;
    this.aborted = true;
    const err = new AbortError();
    const all: Pending[] = [...this.waits, ...this.conds, ...this.tweens];
    this.waits = [];
    this.conds = [];
    this.tweens = [];
    this.updaters.clear();
    all.forEach((p) => p.reject(err));
  }
}
