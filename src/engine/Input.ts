/**
 * Unified input: keyboard + mouse, touch (virtual joystick and buttons) and
 * gamepads. Game code reads `move`, `look`, `down(action)` and
 * `pressed(action)` (edge-triggered, cleared each frame by `endFrame`).
 */
export type Action = 'interact' | 'jump' | 'pause' | 'action' | 'run';

const KEYMAP: Record<string, Action> = {
  KeyE: 'interact',
  Enter: 'interact',
  Space: 'jump',
  Escape: 'pause',
  KeyP: 'pause',
  KeyF: 'action',
  ShiftLeft: 'run',
  ShiftRight: 'run',
};

export class Input {
  readonly move = { x: 0, y: 0 };
  readonly look = { dx: 0, dy: 0 };
  readonly isTouch: boolean;
  /** When false (menus/dialogue), movement & look are zeroed. */
  enabled = true;
  /** Mouse left-button hold counts as `action` (used by mini-games). */
  mouseAction = false;

  private keys = new Set<string>();
  private heldActions = new Set<Action>();
  private pressedSet = new Set<Action>();
  private joy = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  private lookPointer = -1;
  private lastLook = { x: 0, y: 0 };
  private runToggle = false;
  private padPrev: boolean[] = [];

  private touchLayer: HTMLDivElement;
  private joyBase: HTMLDivElement;
  private joyKnob: HTMLDivElement;
  private btnInteract: HTMLButtonElement;
  private btnAction: HTMLButtonElement;
  private btnRun: HTMLButtonElement;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.heldActions.clear();
    });
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.touchLayer = document.createElement('div');
    this.touchLayer.className = 'touch-layer';
    this.joyBase = document.createElement('div');
    this.joyBase.className = 'joy-base';
    this.joyKnob = document.createElement('div');
    this.joyKnob.className = 'joy-knob';
    this.joyBase.appendChild(this.joyKnob);
    const pad = document.createElement('div');
    pad.className = 'touch-buttons';
    this.btnInteract = this.makeButton('Talk', 'interact', 'tb-interact');
    this.btnAction = this.makeButton('Act', 'action', 'tb-action');
    const jump = this.makeButton('Jump', 'jump', 'tb-jump');
    this.btnRun = document.createElement('button');
    this.btnRun.className = 'tb tb-run';
    this.btnRun.textContent = 'Run';
    this.btnRun.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.runToggle = !this.runToggle;
      this.btnRun.classList.toggle('on', this.runToggle);
    });
    const pause = document.createElement('button');
    pause.className = 'tb tb-pause';
    pause.setAttribute('aria-label', 'Pause');
    pause.textContent = '❚❚';
    pause.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.pressedSet.add('pause');
    });
    pad.append(this.btnAction, this.btnInteract, jump, this.btnRun);
    this.touchLayer.append(this.joyBase, pad, pause);
    uiRoot.appendChild(this.touchLayer);
    this.setInteractLabel(null);
    this.setActionLabel(null);
    this.setTouchVisible(false);
  }

  private makeButton(label: string, action: Action, cls: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = `tb ${cls}`;
    b.textContent = label;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.pressedSet.add(action);
      this.heldActions.add(action);
      b.classList.add('down');
    });
    const up = () => {
      this.heldActions.delete(action);
      b.classList.remove('down');
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointerleave', up);
    b.addEventListener('pointercancel', up);
    return b;
  }

  setTouchVisible(v: boolean): void {
    this.touchLayer.style.display = this.isTouch && v ? 'block' : 'none';
  }

  setInteractLabel(label: string | null): void {
    this.btnInteract.textContent = label ?? 'Talk';
    this.btnInteract.classList.toggle('dim', !label);
  }

  setActionLabel(label: string | null): void {
    this.btnAction.textContent = label ?? '';
    this.btnAction.style.display = label ? '' : 'none';
  }

  private isTyping(e: Event): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.isTyping(e)) return;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    const a = KEYMAP[e.code];
    if (a) {
      this.pressedSet.add(a);
      this.heldActions.add(a);
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    const a = KEYMAP[e.code];
    if (a) this.heldActions.delete(a);
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      if (e.button === 0 && this.mouseAction) {
        this.pressedSet.add('action');
        this.heldActions.add('action');
      }
      this.lookPointer = e.pointerId;
      this.lastLook = { x: e.clientX, y: e.clientY };
      return;
    }
    // Touch / pen: left 45% of the screen spawns the joystick, right side looks.
    if (e.clientX < window.innerWidth * 0.45 && this.joy.id < 0) {
      this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      this.joyBase.style.left = `${e.clientX}px`;
      this.joyBase.style.top = `${e.clientY}px`;
      this.joyBase.classList.add('active');
      this.joyKnob.style.transform = 'translate(-50%, -50%)';
    } else if (this.lookPointer < 0) {
      this.lookPointer = e.pointerId;
      this.lastLook = { x: e.clientX, y: e.clientY };
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerId === this.joy.id) {
      const R = 56;
      let dx = e.clientX - this.joy.ox;
      let dy = e.clientY - this.joy.oy;
      const len = Math.hypot(dx, dy);
      if (len > R) {
        dx = (dx / len) * R;
        dy = (dy / len) * R;
      }
      this.joy.x = dx / R;
      this.joy.y = -dy / R;
      this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else if (e.pointerId === this.lookPointer) {
      const k = e.pointerType === 'mouse' ? 0.005 : 0.008;
      this.look.dx += (e.clientX - this.lastLook.x) * k;
      this.look.dy += (e.clientY - this.lastLook.y) * k;
      this.lastLook = { x: e.clientX, y: e.clientY };
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId === this.joy.id) {
      this.joy = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
      this.joyBase.classList.remove('active');
    }
    if (e.pointerId === this.lookPointer) this.lookPointer = -1;
    if (e.pointerType === 'mouse' && e.button === 0) this.heldActions.delete('action');
  };

  /** Poll keyboard/joystick/gamepad into `move`. Call once per frame. */
  update(): void {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    x += this.joy.x;
    y += this.joy.y;
    this.pollGamepad((gx, gy) => {
      x += gx;
      y += gy;
    });
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.move.x = this.enabled ? x : 0;
    this.move.y = this.enabled ? y : 0;
    if (!this.enabled) {
      this.look.dx = 0;
      this.look.dy = 0;
    }
  }

  private pollGamepad(addMove: (x: number, y: number) => void): void {
    const pads = navigator.getGamepads?.() ?? [];
    const gp = Array.from(pads).find((p) => p && p.connected);
    if (!gp) return;
    const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
    addMove(dz(gp.axes[0] ?? 0), -dz(gp.axes[1] ?? 0));
    this.look.dx += dz(gp.axes[2] ?? 0) * 0.05;
    this.look.dy += dz(gp.axes[3] ?? 0) * 0.04;
    const map: [number, Action][] = [
      [0, 'jump'],
      [2, 'interact'],
      [1, 'interact'],
      [7, 'action'],
      [5, 'action'],
      [9, 'pause'],
      [10, 'run'],
      [4, 'run'],
    ];
    const now: boolean[] = [];
    for (const [idx, action] of map) {
      const b = gp.buttons[idx]?.pressed ?? false;
      now[idx] = b;
      if (b && !this.padPrev[idx]) this.pressedSet.add(action);
      if (b) this.heldActions.add(action);
      else if (this.padPrev[idx]) this.heldActions.delete(action);
    }
    this.padPrev = now;
  }

  down(a: Action): boolean {
    if (a === 'run') return this.heldActions.has('run') || this.runToggle;
    return this.heldActions.has(a);
  }

  pressed(a: Action): boolean {
    return this.pressedSet.has(a);
  }

  /** Clear edge-triggered presses and look deltas. Call at frame end. */
  endFrame(): void {
    this.pressedSet.clear();
    this.look.dx = 0;
    this.look.dy = 0;
  }

  /** Forget held keys (used when opening menus so nothing sticks). */
  reset(): void {
    this.keys.clear();
    this.heldActions.clear();
    this.pressedSet.clear();
    this.joy = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
    this.joyBase.classList.remove('active');
  }
}
