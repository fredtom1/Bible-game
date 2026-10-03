import { describe, expect, it } from 'vitest';
import { TaskRunner, isAbort } from '../src/engine/tasks';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('TaskRunner', () => {
  it('resolves waits in game time, not wall time', async () => {
    const r = new TaskRunner();
    let done = false;
    void r.wait(1).then(() => (done = true));
    r.update(0.5);
    await flush();
    expect(done).toBe(false);
    r.update(0.6);
    await flush();
    expect(done).toBe(true);
  });

  it('runs tweens from 0 to 1 with easing applied', async () => {
    const r = new TaskRunner();
    const seen: number[] = [];
    const p = r.tween(1, (t) => seen.push(t), (t) => t);
    r.update(0.25);
    r.update(0.25);
    r.update(0.6);
    await p;
    expect(seen[0]).toBe(0);
    expect(seen).toContain(0.5);
    expect(seen[seen.length - 1]).toBe(1);
  });

  it('waitUntil resolves when the predicate becomes true', async () => {
    const r = new TaskRunner();
    let flag = false;
    let done = false;
    void r.waitUntil(() => flag).then(() => (done = true));
    r.update(0.1);
    await flush();
    expect(done).toBe(false);
    flag = true;
    r.update(0.1);
    await flush();
    expect(done).toBe(true);
  });

  it('abort rejects everything pending with an AbortError and stops updaters', async () => {
    const r = new TaskRunner();
    let ticks = 0;
    r.onUpdate(() => ticks++);
    const results = await Promise.allSettled([
      (async () => {
        const p = r.wait(10);
        r.abort();
        await p;
      })(),
      r.waitUntil(() => false),
      r.tween(5, () => undefined),
    ]);
    r.update(1);
    expect(ticks).toBe(0);
    for (const res of results) {
      expect(res.status).toBe('rejected');
      if (res.status === 'rejected') expect(isAbort(res.reason)).toBe(true);
    }
    await expect(r.wait(1)).rejects.toSatisfy(isAbort);
  });

  it('guard rejects an outside promise when the runner is aborted first', async () => {
    const r = new TaskRunner();
    const never = new Promise<number>(() => undefined);
    const g = r.guard(never);
    r.abort();
    await expect(g).rejects.toSatisfy(isAbort);
    const r2 = new TaskRunner();
    await expect(r2.guard(Promise.resolve(7))).resolves.toBe(7);
  });
});
