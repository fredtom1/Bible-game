import { h, ICON } from './dom';
import { rankFor } from '../logic/progress';

export interface MarkerState {
  x: number;
  y: number;
  onScreen: boolean;
  angle: number;
  dist: number;
}

/** In-game heads-up display. */
export class HUD {
  readonly el: HTMLDivElement;
  private eraChip: HTMLDivElement;
  private objective: HTMLDivElement;
  private objText: HTMLSpanElement;
  private objCount: HTMLSpanElement;
  private prompt: HTMLDivElement;
  private xpPill: HTMLDivElement;
  private toasts: HTMLDivElement;
  private factEl: HTMLDivElement;
  private marker: HTMLDivElement;
  private meters: HTMLDivElement;
  private meterMap = new Map<string, { root: HTMLDivElement; fill: HTMLDivElement; label: HTMLSpanElement }>();
  private banner: HTMLDivElement;
  private factTimer = 0;
  private lastXp = -1;

  constructor(root: HTMLElement, handlers: { onPause: () => void; onJournal: () => void }) {
    this.eraChip = h('div', { class: 'era-chip' });
    this.objText = h('span', { class: 'obj-text' });
    this.objCount = h('span', { class: 'obj-count' });
    this.objective = h('div', { class: 'objective' }, h('span', { class: 'obj-icon', html: '✦' }), this.objText, this.objCount);
    this.prompt = h('div', { class: 'prompt' });
    this.xpPill = h('div', { class: 'xp-pill' });
    const pauseBtn = h('button', { class: 'icon-btn', 'aria-label': 'Pause', html: ICON.pause, onclick: () => handlers.onPause() });
    const bookBtn = h('button', { class: 'icon-btn', 'aria-label': 'Chronicle', html: ICON.book, onclick: () => handlers.onJournal() });
    this.toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
    this.factEl = h('div', { class: 'fact-card' });
    this.marker = h('div', { class: 'marker-arrow' }, h('div', { class: 'marker-dot' }), h('span', { class: 'marker-dist' }));
    this.meters = h('div', { class: 'meters' });
    this.banner = h('div', { class: 'banner' });
    this.el = h(
      'div',
      { class: 'hud' },
      h('div', { class: 'hud-tl' }, this.eraChip, this.objective),
      h('div', { class: 'hud-tr' }, this.xpPill, bookBtn, pauseBtn),
      this.meters,
      this.banner,
      this.prompt,
      this.toasts,
      this.factEl,
      this.marker,
    );
    root.appendChild(this.el);
    this.setObjective(null);
    this.setPrompt(null);
  }

  show(v: boolean): void {
    this.el.classList.toggle('hidden', !v);
  }

  setEra(title: string, sub: string): void {
    this.eraChip.innerHTML = `<b>${title}</b><small>${sub}</small>`;
  }

  setObjective(text: string | null, count?: string): void {
    this.objective.classList.toggle('hidden', !text);
    if (text && text !== this.objText.textContent) {
      this.objective.classList.remove('pulse');
      void this.objective.offsetWidth;
      this.objective.classList.add('pulse');
    }
    this.objText.textContent = text ?? '';
    this.objCount.textContent = count ?? '';
  }

  setCount(count: string): void {
    this.objCount.textContent = count;
  }

  setPrompt(label: string | null, key = 'E'): void {
    this.prompt.classList.toggle('hidden', !label);
    if (label) this.prompt.innerHTML = `<kbd>${key}</kbd><span>${label}</span>`;
  }

  setXP(xp: number): void {
    if (xp === this.lastXp) return;
    this.lastXp = xp;
    const r = rankFor(xp);
    this.xpPill.innerHTML = `<span class="rank">${r.rank.title}</span><span class="xpbar"><i style="width:${Math.round(
      r.progress * 100,
    )}%"></i></span><span class="xpnum">${xp} XP</span>`;
  }

  toast(text: string, kind: 'xp' | 'info' | 'good' | 'warn' = 'info', ms = 2600): void {
    const t = h('div', { class: `toast ${kind}` }, text);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild?.remove();
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 500);
  }

  fact(title: string, text: string, ref?: string): void {
    this.factEl.innerHTML = '';
    this.factEl.append(
      h('div', { class: 'fact-kicker' }, 'Scroll fragment found'),
      h('h4', null, title),
      h('p', null, text),
      ...(ref ? [h('cite', null, ref)] : []),
    );
    this.factEl.classList.add('in');
    clearTimeout(this.factTimer);
    this.factTimer = window.setTimeout(() => this.factEl.classList.remove('in'), 7000);
  }

  setMarker(m: MarkerState | null): void {
    if (!m) {
      this.marker.style.display = 'none';
      return;
    }
    this.marker.style.display = 'block';
    this.marker.classList.toggle('offscreen', !m.onScreen);
    this.marker.style.transform = `translate(${m.x}px, ${m.y}px)`;
    const dot = this.marker.firstChild as HTMLDivElement;
    dot.style.transform = m.onScreen ? 'rotate(45deg)' : `rotate(${m.angle}rad)`;
    (this.marker.lastChild as HTMLSpanElement).textContent = `${Math.round(m.dist)} m`;
  }

  /** Generic bar meter for mini-games (timer, power, stamina…). */
  setMeter(id: string, label: string | null, value = 0, color = '#f3c86a'): void {
    let m = this.meterMap.get(id);
    if (label === null) {
      m?.root.remove();
      this.meterMap.delete(id);
      return;
    }
    if (!m) {
      const fill = h('div', { class: 'meter-fill' });
      const lab = h('span', { class: 'meter-label' });
      const root = h('div', { class: 'meter' }, lab, h('div', { class: 'meter-track' }, fill));
      this.meters.appendChild(root);
      m = { root, fill, label: lab };
      this.meterMap.set(id, m);
    }
    m.label.textContent = label;
    m.fill.style.width = `${Math.max(0, Math.min(1, value)) * 100}%`;
    m.fill.style.background = color;
  }

  clearMeters(): void {
    for (const id of Array.from(this.meterMap.keys())) this.setMeter(id, null);
  }

  setBanner(text: string | null, sub?: string): void {
    this.banner.classList.toggle('in', !!text);
    if (text) this.banner.innerHTML = `<b>${text}</b>${sub ? `<small>${sub}</small>` : ''}`;
  }
}
