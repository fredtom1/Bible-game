import { h, speak, stopSpeaking } from './dom';
import { audio } from '../engine/Audio';

export interface Line {
  who: string;
  text: string;
  ref?: string;
  color?: string;
  choices?: string[];
  /** Called when the line starts (e.g. to animate the speaker). */
  onShow?: () => void;
}

const ADVANCE_KEYS = new Set(['KeyE', 'Enter', 'Space', 'NumpadEnter']);

/** Dialogue box, cinematic narration, letterbox, fades and time-warp. */
export class StoryUI {
  private dlg: HTMLDivElement;
  private portrait: HTMLDivElement;
  private nameEl: HTMLDivElement;
  private textEl: HTMLParagraphElement;
  private refEl: HTMLElement;
  private choicesEl: HTMLDivElement;
  private nextEl: HTMLDivElement;
  private bars: HTMLDivElement;
  private caption: HTMLDivElement;
  private fader: HTMLDivElement;
  private warp: HTMLDivElement;
  narrator = false;
  busy = false;

  constructor(root: HTMLElement) {
    this.portrait = h('div', { class: 'portrait' });
    this.nameEl = h('div', { class: 'dlg-name' });
    this.textEl = h('p', { class: 'dlg-text' });
    this.refEl = h('cite', { class: 'dlg-ref' });
    this.choicesEl = h('div', { class: 'dlg-choices' });
    this.nextEl = h('div', { class: 'dlg-next' }, '▼');
    this.dlg = h(
      'div',
      { class: 'dialogue hidden', role: 'dialog', 'aria-live': 'polite' },
      this.portrait,
      h('div', { class: 'dlg-body' }, this.nameEl, this.textEl, this.refEl, this.choicesEl),
      this.nextEl,
    );
    this.bars = h('div', { class: 'letterbox' }, h('div', { class: 'bar top' }), h('div', { class: 'bar bottom' }));
    this.caption = h('div', { class: 'caption hidden' });
    this.fader = h('div', { class: 'fader' });
    this.warp = h('div', { class: 'warp hidden' });
    root.append(this.bars, this.caption, this.dlg, this.fader, this.warp);
  }

  letterbox(on: boolean): void {
    this.bars.classList.toggle('on', on);
  }

  /** Show lines one by one. Resolves with the chosen index for each choice line. */
  dialogue(lines: Line[]): Promise<number[]> {
    this.busy = true;
    const picks: number[] = [];
    this.dlg.classList.remove('hidden');
    return new Promise((resolve) => {
      let i = -1;
      let typing = 0;
      let full = '';
      let shown = 0;
      let waitingChoice = false;
      const finishTyping = () => {
        clearInterval(typing);
        typing = 0;
        this.textEl.textContent = full;
        const line = lines[i];
        if (line.choices?.length) {
          waitingChoice = true;
          this.nextEl.style.visibility = 'hidden';
          line.choices.forEach((c, idx) => {
            const b = h('button', { class: 'choice' }, h('kbd', null, String(idx + 1)), c);
            b.addEventListener('click', (e) => {
              e.stopPropagation();
              choose(idx);
            });
            this.choicesEl.appendChild(b);
          });
        } else {
          this.nextEl.style.visibility = 'visible';
        }
      };
      const choose = (idx: number) => {
        if (!waitingChoice) return;
        waitingChoice = false;
        picks.push(idx);
        audio.play('click');
        next();
      };
      const next = () => {
        i++;
        if (i >= lines.length) {
          cleanup();
          resolve(picks);
          return;
        }
        const line = lines[i];
        line.onShow?.();
        this.choicesEl.innerHTML = '';
        this.nextEl.style.visibility = 'hidden';
        const isNarr = line.who === '' || line.who === 'Narrator';
        this.dlg.classList.toggle('narr', isNarr);
        this.portrait.textContent = isNarr ? '✦' : line.who.replace(/^the\s+/i, '').charAt(0).toUpperCase();
        this.portrait.style.background = line.color ?? (isNarr ? '#3b2a63' : '#6a4a2a');
        this.nameEl.textContent = isNarr ? 'Narrator' : line.who;
        this.refEl.textContent = line.ref ?? '';
        full = line.text;
        shown = 0;
        this.textEl.textContent = '';
        if (this.narrator) speak(`${isNarr ? '' : line.who + ' says: '}${line.text}`, { pitch: isNarr ? 0.95 : 1.05 });
        typing = window.setInterval(() => {
          shown += 2;
          this.textEl.textContent = full.slice(0, shown);
          if (shown % 6 === 0) audio.play('blip');
          if (shown >= full.length) finishTyping();
        }, 28);
      };
      const advance = () => {
        if (waitingChoice) return;
        if (typing) finishTyping();
        else next();
      };
      const onKey = (e: KeyboardEvent) => {
        if (waitingChoice && /^Digit[1-4]$/.test(e.code)) {
          const idx = Number(e.code.slice(5)) - 1;
          if (idx < (lines[i].choices?.length ?? 0)) choose(idx);
          return;
        }
        if (ADVANCE_KEYS.has(e.code)) {
          e.preventDefault();
          advance();
        }
      };
      const onClick = () => advance();
      const cleanup = () => {
        clearInterval(typing);
        window.removeEventListener('keydown', onKey, true);
        this.dlg.removeEventListener('click', onClick);
        this.dlg.classList.add('hidden');
        this.choicesEl.innerHTML = '';
        stopSpeaking();
        this.busy = false;
      };
      window.addEventListener('keydown', onKey, true);
      this.dlg.addEventListener('click', onClick);
      next();
    });
  }

  /** Cinematic caption; auto-advances after a reading delay or on tap/key. */
  narrate(text: string, ref?: string, minSeconds = 0): Promise<void> {
    this.caption.innerHTML = '';
    this.caption.append(h('p', null, text), ...(ref ? [h('cite', null, ref)] : []), h('small', { class: 'tap' }, 'tap to continue'));
    this.caption.classList.remove('hidden');
    this.caption.classList.remove('show');
    void this.caption.offsetWidth;
    this.caption.classList.add('show');
    if (this.narrator) speak(text, { rate: 0.95, pitch: 0.95 });
    const readTime = Math.max(minSeconds, 2.8 + text.length * 0.055);
    return new Promise((resolve) => {
      let done = false;
      const start = performance.now();
      const finish = () => {
        if (done) return;
        if (performance.now() - start < 450) return; // avoid instant skip
        done = true;
        clearTimeout(timer);
        window.removeEventListener('keydown', onKey, true);
        this.caption.removeEventListener('click', finish);
        window.removeEventListener('pointerdown', finish, true);
        this.caption.classList.remove('show');
        setTimeout(() => this.caption.classList.add('hidden'), 350);
        resolve();
      };
      const onKey = (e: KeyboardEvent) => {
        if (ADVANCE_KEYS.has(e.code)) {
          e.preventDefault();
          finish();
        }
      };
      const timer = window.setTimeout(() => {
        done = false;
        finish();
      }, readTime * 1000);
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('pointerdown', finish, true);
    });
  }

  fade(to: number, seconds: number, color = '#000'): Promise<void> {
    this.fader.style.background = color;
    this.fader.style.transition = `opacity ${seconds}s ease`;
    this.fader.style.pointerEvents = to > 0.5 ? 'all' : 'none';
    void this.fader.offsetWidth;
    this.fader.style.opacity = String(to);
    return new Promise((r) => setTimeout(r, seconds * 1000 + 30));
  }

  /** Swirling time-travel transition. Call `end()` when the new scene is ready. */
  timewarp(title: string, sub: string): { end: () => Promise<void> } {
    this.warp.innerHTML = '';
    this.warp.append(
      h('div', { class: 'warp-rings' }, h('i'), h('i'), h('i'), h('i')),
      h('div', { class: 'warp-text' }, h('small', null, sub), h('b', null, title)),
    );
    this.warp.classList.remove('hidden', 'out');
    audio.play('gate');
    audio.play('whoosh');
    const started = performance.now();
    return {
      end: async () => {
        const elapsed = performance.now() - started;
        if (elapsed < 2200) await new Promise((r) => setTimeout(r, 2200 - elapsed));
        this.warp.classList.add('out');
        await new Promise((r) => setTimeout(r, 700));
        this.warp.classList.add('hidden');
      },
    };
  }
}
