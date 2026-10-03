import * as THREE from 'three';
import { CameraRig } from '../engine/CameraRig';
import { Input } from '../engine/Input';
import { audio } from '../engine/Audio';
import { isAbort } from '../engine/tasks';
import { UI } from '../ui/UI';
import { Stage, type Quality, type Services } from '../world/Stage';
import type { Look } from '../world/Character';
import {
  ERA_ORDER,
  completedCount,
  eraProgress,
  isEraUnlocked,
  loadSave,
  rankFor,
  recordEraResult,
  recordVerse,
  newSave,
  touchStreak,
  writeSave,
  type AvatarConfig,
  type EraId,
  type SaveData,
  type Settings,
} from '../logic/progress';
import {
  certificateScreen,
  creatorScreen,
  DEFAULT_AVATAR,
  eraIntro,
  helpScreen,
  journalScreen,
  openModal,
  pauseMenu,
  resultsScreen,
  settingsScreen,
  titleScreen,
} from '../ui/screens';
import { verseChallenge } from '../ui/verseChallenge';
import { h } from '../ui/dom';
import { ERA_BY_ID, ERAS } from '../content/catalog';
import { ERA_LOADERS, type EraModule } from '../content/eraTypes';
import { buildHub, HUB_MUSIC, type Hub } from '../content/hub';
import type { Translation } from '../content/verses';

type Mode = 'loading' | 'title' | 'creator' | 'hub' | 'era';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function avatarLook(a: AvatarConfig): Look {
  return {
    skin: a.skin,
    robe: a.outfit,
    robe2: a.outfit,
    sash: a.accent,
    hair: a.hairStyle,
    hairColor: a.hairColor,
    headwear: a.headwear,
    headwearColor: a.accent === '#e8dcc0' ? '#c9b48a' : '#efe6d2',
    height: 0.94,
  };
}

function detectQuality(pref: Settings['quality']): Quality {
  const touch = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  let level = pref;
  if (level === 'auto') level = touch ? (cores <= 4 ? 'low' : 'medium') : 'high';
  const dpr = window.devicePixelRatio || 1;
  if (level === 'high') return { shadows: true, shadowSize: 2048, pixelRatio: Math.min(dpr, 2), particles: 1 };
  if (level === 'medium') return { shadows: true, shadowSize: 1024, pixelRatio: Math.min(dpr, 1.5), particles: 0.6 };
  return { shadows: false, shadowSize: 512, pixelRatio: Math.min(dpr, 1), particles: 0.35 };
}

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly cam: CameraRig;
  readonly input: Input;
  readonly ui: UI;
  save: SaveData;
  stage: Stage | null = null;
  hub: Hub | null = null;
  quality: Quality;
  mode: Mode = 'loading';
  paused = false;
  currentEra: EraId | null = null;
  private last = performance.now();
  private orbitT = 0;
  private titleRun = 0;
  private uiRoot: HTMLElement;
  private debug = new URLSearchParams(location.search).has('debug');
  /** Debug-only time multiplier (?debug&speed=4) for automated playtests. */
  private timeScale = this.debug ? Number(new URLSearchParams(location.search).get('speed') ?? 1) || 1 : 1;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.uiRoot = uiRoot;
    this.save = touchStreak(loadSave(storage()), new Date());
    this.quality = detectQuality(this.save.settings.quality);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality.pixelRatio <= 1.5, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.cam = new CameraRig(window.innerWidth / window.innerHeight);
    this.input = new Input(canvas, uiRoot);
    this.ui = new UI(uiRoot, { onPause: () => void this.openPause(), onJournal: () => void this.openJournal() });
    this.applySettings(this.save.settings);
    window.addEventListener('resize', () => this.resize());
    const unlockAudio = () => audio.unlock();
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    if (this.debug) (window as unknown as { __game: Game }).__game = this;
  }

  // ---------------------------------------------------------------- services

  private services(): Services {
    return {
      renderer: this.renderer,
      cam: this.cam,
      input: this.input,
      ui: this.ui,
      quality: this.quality,
      getSave: () => this.save,
      updateSave: (fn) => this.updateSave(fn),
      addXP: (n, reason) => this.addXP(n, reason),
    };
  }

  updateSave(fn: (s: SaveData) => SaveData): void {
    this.save = fn(this.save);
    writeSave(storage(), this.save);
  }

  addXP(n: number, reason?: string): void {
    if (n <= 0) return;
    const before = rankFor(this.save.xp).rank.title;
    this.updateSave((s) => ({ ...s, xp: s.xp + n }));
    this.ui.hud.setXP(this.save.xp);
    this.ui.hud.toast(`+${n} XP${reason ? ` · ${reason}` : ''}`, 'xp', 1800);
    const after = rankFor(this.save.xp).rank.title;
    if (after !== before) {
      audio.play('fanfare');
      this.ui.hud.toast(`Rank up! You are now a ${after}`, 'good', 4200);
    }
  }

  applySettings(s: Settings, translation?: Translation): void {
    this.updateSave((sv) => ({
      ...sv,
      settings: s,
      profile: sv.profile && translation ? { ...sv.profile, translation } : sv.profile,
    }));
    audio.setVolumes(s.music, s.sfx);
    this.ui.story.narrator = s.narrator;
    this.ui.applyPrefs(s.largeText, s.reduceMotion);
    const q = detectQuality(s.quality);
    if (q.pixelRatio !== this.quality.pixelRatio) {
      this.renderer.setPixelRatio(q.pixelRatio);
      this.resize();
    }
    this.quality = q;
    this.hub?.refresh(this.save);
  }

  private resize(): void {
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    this.renderer.setSize(w, hgt, false);
    this.cam.camera.aspect = w / hgt;
    this.cam.camera.updateProjectionMatrix();
  }

  private look(): Look {
    return avatarLook(this.save.profile?.avatar ?? DEFAULT_AVATAR);
  }

  // ---------------------------------------------------------------- loop

  start(): void {
    this.buildHubStage();
    document.getElementById('boot')?.classList.add('gone');
    this.ui.hud.setXP(this.save.xp);
    requestAnimationFrame(this.frame);
    const era = new URLSearchParams(location.search).get('era') as EraId | null;
    if (era && ERA_ORDER.includes(era) && (this.debug || (this.save.profile && isEraUnlocked(this.save, era)))) {
      if (!this.save.profile) {
        this.updateSave((s) => ({ ...s, profile: { name: 'Traveller', avatar: { ...DEFAULT_AVATAR }, translation: 'WEB', createdAt: Date.now() }, tutorialDone: true }));
      }
      void this.enterEra(era);
      return;
    }
    void this.showTitle();
  }

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000) * this.timeScale;
    this.last = now;
    this.input.enabled = !this.ui.busy && !this.paused;
    this.input.update();
    const stage = this.stage;
    if (stage && !this.paused) {
      if (this.mode === 'title') this.titleCamera(dt);
      stage.update(dt);
      if (this.mode !== 'title' && this.mode !== 'creator') this.cam.setFocus(stage.player.position);
    }
    if (stage) {
      this.cam.update(dt, this.input.look.dx, this.input.look.dy);
      this.renderer.render(stage.scene, this.cam.camera);
    }
    audio.update();
    if (this.input.pressed('pause') && !this.ui.busy && !this.paused && (this.mode === 'hub' || this.mode === 'era')) {
      void this.openPause();
    }
    this.input.endFrame();
  };

  private titleCamera(dt: number): void {
    this.orbitT += dt * 0.06;
    const r = 36;
    this.cam.cut(
      { x: Math.sin(this.orbitT) * r, y: 11 + Math.sin(this.orbitT * 0.7) * 2, z: Math.cos(this.orbitT) * r },
      { x: 0, y: 3, z: 0 },
    );
  }

  // ---------------------------------------------------------------- hub

  private buildHubStage(returnFrom?: EraId): void {
    this.stage?.dispose();
    const stage = new Stage(this.services(), { seed: 7, look: this.look(), atmosphere: 'heaven' });
    this.stage = stage;
    this.hub = buildHub(stage, this.save, {
      onGate: (id) => void this.openGate(id),
      onVault: () => void this.openJournal('verses'),
      onMirror: () => void this.editAvatar(),
    });
    const hub = this.hub;
    const g = returnFrom ? hub.gates[ERA_ORDER.indexOf(returnFrom)] : null;
    if (g) {
      const p = g.pos.clone().addScaledVector(g.front, 5);
      stage.player.teleport(p.x, p.z, Math.atan2(g.front.x, g.front.z), stage);
    } else {
      stage.player.teleport(hub.spawn.x, hub.spawn.z, Math.PI, stage);
    }
    this.cam.snapBehind(stage.player.position, stage.player.heading);
    this.cam.release(stage.player.position);
    this.cam.snapBehind(stage.player.position, stage.player.heading);
    this.setupSelah();
    this.ui.hud.setEra('Hall of Ages', 'Outside of time');
  }

  private setupSelah(): void {
    const stage = this.stage!;
    const selah = this.hub!.selah;
    stage.interactable(selah, 'Talk to Selah', async () => {
      const done = completedCount(this.save);
      const next = ERAS.find((e) => !eraProgress(this.save, e.id).completed);
      const lines = [
        done === 0
          ? stage.line(selah, 'The Gate of the Flood is awake. Step through when you are ready. Remember: watch, listen, and help where you can.')
          : next
            ? stage.line(selah, `${done} of 7 ages walked. The next gate, ${next.title}, is waiting. ${next.summary.split('.')[0]}.`)
            : stage.line(selah, 'You have walked every age. You can return to any gate, or practise your verses at the Vault.'),
        stage.line(selah, 'Tip: there are three scroll fragments hidden in every age. Explore off the path, and look for a golden glow.'),
      ];
      await stage.talk(lines);
    }, 3.2, () => this.save.tutorialDone);
  }

  async showTitle(): Promise<void> {
    const run = ++this.titleRun;
    this.mode = 'title';
    if (!this.stage || !this.hub) this.buildHubStage();
    this.ui.hud.show(false);
    this.input.setTouchVisible(false);
    audio.playMusic(HUB_MUSIC);
    while (run === this.titleRun) {
      const choice = await this.ui.modal(titleScreen(this.uiRoot, this.save));
      if (choice === 'continue') return this.enterHub();
      if (choice === 'new') {
        if (this.save.profile) {
          const ok = await this.confirm('Start a new journey? This erases your current progress on this device.');
          if (!ok) continue;
          const settings = this.save.settings;
          this.updateSave(() => ({ ...newSave(), settings }));
          this.buildHubStage();
        }
        return this.newJourney();
      }
      if (choice === 'journal') await this.openJournal();
      if (choice === 'settings') await this.openSettings();
      if (choice === 'help') await this.ui.modal(helpScreen(this.uiRoot));
    }
  }

  private confirm(text: string): Promise<boolean> {
    return this.ui.modal(
      new Promise<boolean>((resolve) => {
        const m = openModal(
          this.uiRoot,
          h(
            'div',
            { class: 'card' },
            h('p', null, text),
            h(
              'div',
              { class: 'row' },
              h('button', { class: 'btn ghost', onclick: () => { m.close(); resolve(false); } }, 'Cancel'),
              h('button', { class: 'btn primary', onclick: () => { m.close(); resolve(true); } }, 'Yes, start over'),
            ),
          ),
        );
      }),
    );
  }

  private framePlayerForCreator(): void {
    const stage = this.stage!;
    const p = stage.player.position;
    stage.player.teleport(0, 15, 0, stage);
    const wide = window.innerWidth > 800;
    const lookX = wide ? p.x - 1.25 : p.x;
    const lookY = wide ? 1.05 : 0.15;
    this.cam.cut({ x: lookX, y: 1.6, z: p.z + 4.2 }, { x: lookX, y: lookY, z: p.z });
  }

  private async editAvatar(initial = this.save.profile): Promise<void> {
    const stage = this.stage!;
    const prevMode = this.mode;
    this.mode = 'creator';
    this.ui.hud.show(false);
    this.input.setTouchVisible(false);
    stage.player.frozen = true;
    this.framePlayerForCreator();
    const spin = stage.onUpdate((_, t) => {
      stage.player.char.root.rotation.y = Math.sin(t * 0.7) * 0.6;
    });
    const profile = await this.ui.modal(
      creatorScreen(this.uiRoot, initial, (a) => stage.player.rebuild(avatarLook(a), stage.scene)),
    );
    spin();
    this.updateSave((s) => ({ ...s, profile }));
    stage.player.rebuild(this.look(), stage.scene);
    stage.player.frozen = false;
    this.mode = prevMode === 'creator' ? 'hub' : prevMode;
    if (this.mode === 'hub') {
      stage.player.teleport(0, 15, Math.PI, stage);
      this.cam.release(stage.player.position);
      this.cam.snapBehind(stage.player.position, Math.PI);
      this.ui.hud.show(true);
      this.input.setTouchVisible(true);
    }
  }

  private async newJourney(): Promise<void> {
    this.mode = 'creator';
    await this.editAvatar(null);
    this.mode = 'hub';
    await this.runIntro();
  }

  private async runIntro(): Promise<void> {
    const stage = this.stage!;
    const selah = this.hub!.selah;
    this.ui.hud.show(true);
    this.input.setTouchVisible(true);
    try {
      await stage.cinematic(async () => {
        await this.ui.story.fade(1, 0.01);
        this.cam.cut({ x: 0, y: 30, z: 60 }, { x: 0, y: 2, z: 0 });
        await this.ui.story.fade(0, 1.5);
        await stage.narrate('It started on an ordinary afternoon. You were helping tidy the old library at church when a sealed scroll rolled off the top shelf…');
        await this.cam.moveTo(stage.runner, { x: 0, y: 9, z: 30 }, { x: 0, y: 3, z: 0 }, 4);
        await stage.narrate('The seal cracked. Golden light spilled across the floor, the walls fell away… and you woke up somewhere outside of time.');
        await this.cam.moveTo(stage.runner, { x: 3, y: 2.4, z: 10 }, { x: 0, y: 1.6, z: 4 }, 3);
      });
      stage.player.teleport(0, 9, Math.PI, stage);
      this.cam.snapBehind(stage.player.position, Math.PI);
      selah.faceTarget = stage.player.position;
      const t = stage.translation;
      await stage.talk([
        stage.line(selah, `Peace to you, ${stage.playerName}. I am Selah, keeper of the scrolls. Welcome to the Hall of Ages.`),
        stage.line(selah, 'Each gate opens onto a moment in Scripture: the flood, the sea, the walls, the giant, the lions, the hillside, and the empty tomb.'),
        stage.line(selah, 'You cannot change what happened. These stories are already written. But you can walk inside them, help where you can, and carry their words home in your heart.'),
        stage.line(selah, `Every traveller starts the same way. Learn the words written over this hall. In the ${t === 'KJV' ? 'King James' : 'World English'} Bible they say…`),
      ]);
      await stage.verse('psalm-119-11');
      this.updateSave((s) => ({ ...s, tutorialDone: true }));
      this.hub!.refresh(this.save);
      stage.sfx('gate');
      await stage.talk([
        stage.line(selah, 'Well done! Do you hear that? The first gate has woken up.'),
        stage.line(selah, 'Follow the golden beam to the Gate of the Flood. When you are ready, step through.'),
        stage.n(
          this.input.isTouch
            ? 'Controls: drag your left thumb to walk, drag on the right to look around, and tap Talk to interact. Tap Run to sprint.'
            : 'Controls: W A S D or the arrow keys to walk, hold Shift to run, drag the mouse to look around, and press E to talk.',
        ),
        stage.n('Tip: press Esc (or ❚❚) any time to pause. Your progress saves automatically.'),
      ]);
      const g = this.hub!.gates[0];
      stage.objective('Enter the Gate of the Flood', g.pos.clone().addScaledVector(g.front, 1.5));
    } catch (e) {
      if (!isAbort(e)) throw e;
    }
  }

  enterHub(returnFrom?: EraId): void {
    this.titleRun++;
    this.mode = 'hub';
    this.currentEra = null;
    if (returnFrom || this.stage === null || !this.hub) this.buildHubStage(returnFrom);
    else {
      const st = this.stage;
      st.player.rebuild(this.look(), st.scene);
      st.player.teleport(this.hub.spawn.x, this.hub.spawn.z, Math.PI, st);
      this.cam.release(st.player.position);
      this.cam.snapBehind(st.player.position, Math.PI);
    }
    this.ui.hud.show(true);
    this.ui.hud.setEra('Hall of Ages', 'Outside of time');
    this.input.setTouchVisible(true);
    audio.playMusic(HUB_MUSIC);
    if (!this.save.tutorialDone) {
      void this.runIntro();
      return;
    }
    const next = ERA_ORDER.find((id) => isEraUnlocked(this.save, id) && !eraProgress(this.save, id).completed);
    if (next && this.hub) {
      const g = this.hub.gates[ERA_ORDER.indexOf(next)];
      this.stage!.objective(`Enter: ${ERA_BY_ID[next].title}`, g.pos.clone().addScaledVector(g.front, 1.5));
    }
    if (completedCount(this.save) === ERA_ORDER.length && !this.save.finaleSeen) void this.finale();
  }

  private async openGate(id: EraId): Promise<void> {
    const enter = await this.ui.modal(eraIntro(this.uiRoot, ERA_BY_ID[id], this.save));
    if (enter) await this.enterEra(id);
  }

  // ---------------------------------------------------------------- eras

  async enterEra(id: EraId): Promise<void> {
    const meta = ERA_BY_ID[id];
    this.titleRun++;
    this.mode = 'loading';
    this.input.setTouchVisible(false);
    const warp = this.ui.story.timewarp(meta.title, `${meta.age} · ${meta.ref}`);
    let mod: EraModule;
    try {
      mod = (await ERA_LOADERS[id]()).default;
    } catch (e) {
      console.error(e);
      await warp.end();
      this.ui.hud.toast('Could not open that gate. Check your connection and try again.', 'warn', 5000);
      this.enterHub();
      return;
    }
    this.stage?.dispose();
    this.hub = null;
    const stage = new Stage(this.services(), { seed: 100 + ERA_ORDER.indexOf(id), look: this.look(), atmosphere: mod.atmosphere });
    this.stage = stage;
    this.currentEra = id;
    stage.knownFragments = new Set(eraProgress(this.save, id).fragments);
    mod.setup(stage);
    stage.bake();
    this.cam.release(stage.player.position);
    this.cam.snapBehind(stage.player.position, stage.player.heading);
    this.ui.hud.setEra(meta.title, `${meta.age} · ${meta.ref}`);
    this.ui.hud.show(true);
    audio.playMusic(mod.music);
    // let the GPU compile shaders behind the warp
    this.renderer.compile(stage.scene, this.cam.camera);
    await warp.end();
    this.mode = 'era';
    this.input.setTouchVisible(true);
    try {
      const gameStars = await mod.play(stage);
      if (this.stage === stage) await this.completeEra(id, stage, gameStars);
    } catch (e) {
      if (!isAbort(e)) {
        console.error(e);
        this.ui.hud.toast('Something went wrong in this era. Returning to the Hall.', 'warn', 5000);
        this.enterHub(id);
      }
    }
  }

  private async completeEra(id: EraId, stage: Stage, gameStars: number): Promise<void> {
    const meta = ERA_BY_ID[id];
    const prev = eraProgress(this.save, id);
    const firstClear = !prev.completed;
    const stars = Math.max(1, Math.min(3, Math.round((gameStars + Math.max(1, stage.verseStars)) / 2)));
    const bonus = firstClear ? 250 : 60;
    this.addXP(bonus, firstClear ? 'Era complete' : 'Era replayed');
    const score = stars * 1000 + stage.fragmentsFound.length * 150 + stage.quizCorrect * 100;
    this.updateSave((s) => recordEraResult(s, id, { stars, score, fragments: stage.fragmentsFound, quizCorrect: stage.quizCorrect }));
    stage.player.frozen = true;
    this.input.setTouchVisible(false);
    const choice = await this.ui.modal(
      resultsScreen(this.uiRoot, {
        meta,
        stars,
        verseStars: stage.verseStars,
        gameStars,
        xp: stage.xpEarned + bonus,
        fragments: stage.fragmentsFound.length,
        quiz: [stage.quizCorrect, stage.quizTotal],
        translation: stage.translation,
        firstClear,
      }),
    );
    if (choice === 'replay') void this.enterEra(id);
    else {
      const warp = this.ui.story.timewarp('Hall of Ages', 'Returning');
      await new Promise((r) => setTimeout(r, 600));
      this.enterHub(id);
      await warp.end();
    }
  }

  private async finale(): Promise<void> {
    const stage = this.stage!;
    const selah = this.hub!.selah;
    this.updateSave((s) => ({ ...s, finaleSeen: true }));
    try {
      await stage.wait(1.2);
      await stage.talk([
        stage.line(selah, `${stage.playerName}… you have walked every age, from the rainbow over the flood to the stone rolled away.`),
        stage.line(selah, 'Did you notice? Every story points forward: a rescue, a promise kept, God with his people when it looked impossible.'),
        stage.line(selah, 'The scroll is not finished. The same God who shut the lions’ mouths and broke the bread is still writing, and your story is part of it.'),
        stage.line(selah, 'Go home, Timewalker. Keep the Word hidden in your heart. Read the whole Book. And share what you found.'),
      ]);
      this.addXP(300, 'Journey complete');
      await this.ui.modal(certificateScreen(this.uiRoot, this.save));
    } catch (e) {
      if (!isAbort(e)) throw e;
    }
  }

  // ---------------------------------------------------------------- menus

  async openPause(): Promise<void> {
    if (this.paused || this.ui.busy || !(this.mode === 'hub' || this.mode === 'era')) return;
    this.paused = true;
    this.input.reset();
    this.input.setTouchVisible(false);
    const choice = await this.ui.modal(pauseMenu(this.uiRoot, this.mode === 'era'));
    this.input.reset(); // the Esc that closed the menu must not reopen it
    this.paused = false;
    this.input.setTouchVisible(true);
    if (choice === 'journal') await this.openJournal();
    else if (choice === 'settings') await this.openSettings();
    else if (choice === 'help') await this.ui.modal(helpScreen(this.uiRoot));
    else if (choice === 'restart' && this.currentEra) void this.enterEra(this.currentEra);
    else if (choice === 'hall') this.enterHub(this.currentEra ?? undefined);
    else if (choice === 'title') {
      this.buildHubStage();
      void this.showTitle();
    }
  }

  async openJournal(tab?: 'verses'): Promise<void> {
    const wasPaused = this.paused;
    this.paused = true;
    this.input.setTouchVisible(false);
    const p = journalScreen(
      this.uiRoot,
      this.save,
      async (verseId) => {
        const res = await this.ui.modal(
          verseChallenge(this.uiRoot, {
            verseId,
            translation: this.save.profile?.translation ?? 'WEB',
            practice: true,
            onTranslation: (t) => this.updateSave((s) => (s.profile ? { ...s, profile: { ...s.profile, translation: t } } : s)),
          }),
        );
        if (res.stars > 0) {
          this.updateSave((s) => recordVerse(s, verseId, res.stars, Date.now()));
          this.addXP(15 * res.stars, 'Verse practice');
        }
      },
      () => void this.ui.modal(certificateScreen(this.uiRoot, this.save)),
    );
    if (tab === 'verses') {
      // open straight onto the Verse Vault tab
      requestAnimationFrame(() => (document.querySelectorAll('.journal .tabs button')[1] as HTMLButtonElement | undefined)?.click());
    }
    await this.ui.modal(p);
    this.paused = wasPaused;
    if (this.mode === 'hub' || this.mode === 'era') this.input.setTouchVisible(true);
  }

  async openSettings(): Promise<void> {
    await this.ui.modal(
      settingsScreen(
        this.uiRoot,
        this.save,
        (s, t) => this.applySettings(s, t),
        () => {
          const settings = this.save.settings;
          this.updateSave(() => ({ ...newSave(), settings }));
          this.ui.hud.setXP(0);
          this.buildHubStage();
          void this.showTitle();
        },
        this.save.profile && this.mode === 'hub' ? () => void this.editAvatar() : undefined,
      ),
    );
  }
}
