import * as THREE from 'three';
import { TaskRunner, isAbort } from '../engine/tasks';
import { mulberry32, clamp, type Rng } from '../engine/noise';
import { audio, type AmbientName, type MusicTheme, type Sfx } from '../engine/Audio';
import type { CameraRig } from '../engine/CameraRig';
import type { Input } from '../engine/Input';
import type { UI } from '../ui/UI';
import type { Line } from '../ui/story';
import { quizModal, type QuizQ } from '../ui/screens';
import { verseChallenge } from '../ui/verseChallenge';
import { Builder, G, disposeTree, MAT } from './geo';
import { SkyDome, ATMOS, type Atmosphere } from './Sky';
import { Rain, ParticleField, flickerFlame, makeFlame } from './Particles';
import { makeTerrain, type TerrainOpts } from './Terrain';
import { makeWaterMaterial, makeWaterPlane } from './Water';
import { Player, NPC, type Physics } from './actors';
import { Animal, Bird, type Species } from './Animal';
import type { Look, Pose } from './Character';
import { recordVerse, type SaveData } from '../logic/progress';
import type { Translation } from '../content/verses';
import type { Fragment } from '../content/catalog';

export interface Quality {
  shadows: boolean;
  shadowSize: number;
  pixelRatio: number;
  particles: number;
}

export interface Services {
  renderer: THREE.WebGLRenderer;
  cam: CameraRig;
  input: Input;
  ui: UI;
  quality: Quality;
  getSave: () => SaveData;
  updateSave: (fn: (s: SaveData) => SaveData) => void;
  addXP: (n: number, reason?: string) => void;
}

type Collider =
  | { kind: 'circle'; x: number; z: number; r: number }
  | { kind: 'box'; x: number; z: number; hw: number; hd: number; c: number; s: number };

export type Target = THREE.Vector3 | THREE.Object3D | NPC | Animal | (() => THREE.Vector3);

interface Interactable {
  pos: () => THREE.Vector3;
  radius: number;
  label: string;
  enabled: () => boolean;
  fire: () => void;
  once: boolean;
  dead?: boolean;
}

interface AtmState {
  top: THREE.Color;
  horizon: THREE.Color;
  bottom: THREE.Color;
  sun: THREE.Color;
  sunDir: THREE.Vector3;
  sunSize: number;
  sunIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  fog: THREE.Color;
  fogNear: number;
  fogFar: number;
  stars: number;
  clouds: number;
  cloudColor: THREE.Color;
  exposure: number;
}

function toState(a: Atmosphere): AtmState {
  return {
    top: new THREE.Color(a.top),
    horizon: new THREE.Color(a.horizon),
    bottom: new THREE.Color(a.bottom),
    sun: new THREE.Color(a.sun),
    sunDir: new THREE.Vector3(...a.sunDir).normalize(),
    sunSize: a.sunSize,
    sunIntensity: a.sunIntensity,
    hemiSky: new THREE.Color(a.hemiSky),
    hemiGround: new THREE.Color(a.hemiGround),
    hemiIntensity: a.hemiIntensity,
    fog: new THREE.Color(a.fog),
    fogNear: a.fogNear,
    fogFar: a.fogFar,
    stars: a.stars,
    clouds: a.clouds,
    cloudColor: new THREE.Color(a.cloudColor),
    exposure: a.exposure,
  };
}

function cloneState(a: AtmState): AtmState {
  return {
    ...a,
    top: a.top.clone(),
    horizon: a.horizon.clone(),
    bottom: a.bottom.clone(),
    sun: a.sun.clone(),
    sunDir: a.sunDir.clone(),
    hemiSky: a.hemiSky.clone(),
    hemiGround: a.hemiGround.clone(),
    fog: a.fog.clone(),
    cloudColor: a.cloudColor.clone(),
  };
}

function lerpState(a: AtmState, b: AtmState, t: number, out: AtmState): void {
  const n = (x: number, y: number) => x + (y - x) * t;
  out.top.lerpColors(a.top, b.top, t);
  out.horizon.lerpColors(a.horizon, b.horizon, t);
  out.bottom.lerpColors(a.bottom, b.bottom, t);
  out.sun.lerpColors(a.sun, b.sun, t);
  out.sunDir.lerpVectors(a.sunDir, b.sunDir, t).normalize();
  out.sunSize = n(a.sunSize, b.sunSize);
  out.sunIntensity = n(a.sunIntensity, b.sunIntensity);
  out.hemiSky.lerpColors(a.hemiSky, b.hemiSky, t);
  out.hemiGround.lerpColors(a.hemiGround, b.hemiGround, t);
  out.hemiIntensity = n(a.hemiIntensity, b.hemiIntensity);
  out.fog.lerpColors(a.fog, b.fog, t);
  out.fogNear = n(a.fogNear, b.fogNear);
  out.fogFar = n(a.fogFar, b.fogFar);
  out.stars = n(a.stars, b.stars);
  out.clouds = n(a.clouds, b.clouds);
  out.cloudColor.lerpColors(a.cloudColor, b.cloudColor, t);
  out.exposure = n(a.exposure, b.exposure);
}

/**
 * A playable 3D place plus the story API that era scripts are written
 * against. One Stage per visit; `dispose()` tears everything down.
 */
export class Stage implements Physics {
  readonly scene = new THREE.Scene();
  readonly runner = new TaskRunner();
  readonly sky = new SkyDome();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly rain: Rain;
  readonly statics: Builder;
  readonly rng: Rng;
  readonly player: Player;
  heightFn: (x: number, z: number) => number = () => 0;
  bounds: { x0: number; x1: number; z0: number; z1: number } | null = null;
  circleBounds: { x: number; z: number; r: number } | null = null;
  npcs: NPC[] = [];
  animals: Animal[] = [];
  birds: Bird[] = [];
  fields: ParticleField[] = [];
  flames: THREE.Sprite[] = [];
  waters: THREE.ShaderMaterial[] = [];
  private colliders: Collider[] = [];
  private interactables: Interactable[] = [];
  private atm: AtmState;
  private atmToken = 0;
  private beacon: THREE.Group;
  private objectiveTarget: Target | null = null;
  private objectiveSince = 0;
  private hinted = false;
  private interactCooldown = 0;
  private fragmentObjs: { frag: Fragment; obj: THREE.Group; taken: boolean }[] = [];
  private tmpV = new THREE.Vector3();
  private projV = new THREE.Vector3();
  fragmentsFound: string[] = [];
  quizCorrect = 0;
  quizTotal = 0;
  verseStars = 0;
  xpEarned = 0;
  disposed = false;

  constructor(readonly svc: Services, opts: { seed: number; look: Look; atmosphere?: string }) {
    this.rng = mulberry32(opts.seed);
    this.statics = new Builder(this.rng);
    const scene = this.scene;
    scene.add(this.sky.mesh);
    this.hemi = new THREE.HemisphereLight('#cfe6ff', '#8c7a5b', 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff1cf', 2.5);
    const q = svc.quality;
    this.sun.castShadow = q.shadows;
    if (q.shadows) {
      this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      const sc = this.sun.shadow.camera;
      sc.left = sc.bottom = -32;
      sc.right = sc.top = 32;
      sc.near = 1;
      sc.far = 220;
      this.sun.shadow.bias = -0.0005;
      this.sun.shadow.normalBias = 0.04;
    }
    scene.add(this.sun, this.sun.target);
    scene.fog = new THREE.Fog('#cfe0ee', 60, 380);
    this.atm = toState(ATMOS[opts.atmosphere ?? 'day']);
    this.applyAtm(this.atm);
    this.rain = new Rain(Math.round(2500 * q.particles));
    scene.add(this.rain.mesh);
    this.player = new Player(opts.look);
    scene.add(this.player.char.root);
    this.beacon = this.makeBeacon();
    scene.add(this.beacon);
    svc.cam.ground = (x, z) => this.heightAt(x, z);
  }

  // ---------------------------------------------------------------- building

  terrain(o: TerrainOpts): THREE.Mesh {
    this.heightFn = o.height;
    const t = makeTerrain(o);
    this.scene.add(t);
    return t;
  }

  water(w: number, d: number, x: number, y: number, z: number, opts: Parameters<typeof makeWaterMaterial>[0] = {}, seg = 48): THREE.Mesh {
    const mat = makeWaterMaterial(opts);
    const m = makeWaterPlane(w, d, seg, mat);
    m.position.set(x, y, z);
    this.scene.add(m);
    this.waters.push(mat);
    this.applyAtm(this.atm);
    return m;
  }

  /** Merge all static props added to `statics` into a few meshes. */
  bake(): void {
    if (this.statics.empty) return;
    const g = this.statics.build();
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = this.svc.quality.shadows;
        o.receiveShadow = true;
      }
    });
    this.scene.add(g);
  }

  addCircle(x: number, z: number, r: number): void {
    this.colliders.push({ kind: 'circle', x, z, r });
  }

  /** Oriented box collider; `ry` rotates it like a mesh rotation.y. */
  addBox(x: number, z: number, w: number, d: number, ry = 0): void {
    this.colliders.push({ kind: 'box', x, z, hw: w / 2, hd: d / 2, c: Math.cos(ry), s: Math.sin(ry) });
  }

  addWallCollider(x1: number, z1: number, x2: number, z2: number, thick: number): void {
    const len = Math.hypot(x2 - x1, z2 - z1);
    this.addBox((x1 + x2) / 2, (z1 + z2) / 2, thick, len, Math.atan2(x2 - x1, z2 - z1));
  }

  clearColliders(pred: (c: { x: number; z: number }) => boolean): void {
    this.colliders = this.colliders.filter((c) => !pred(c));
  }

  addNPC(name: string, look: Look, x: number, z: number, heading = 0, color?: string): NPC {
    const n = new NPC(name, look, color);
    n.place(x, z, heading, this);
    this.scene.add(n.char.root);
    this.npcs.push(n);
    return n;
  }

  addAnimal(species: Species, x: number, z: number, scale = 1, color?: string): Animal {
    const a = new Animal(species, scale, color);
    a.root.position.set(x, this.heightAt(x, z), z);
    a.home.set(x, 0, z);
    this.scene.add(a.root);
    this.animals.push(a);
    return a;
  }

  addBird(path: (t: number) => THREE.Vector3, color?: string, scale = 1): Bird {
    const b = new Bird(color, scale);
    b.path = path;
    this.scene.add(b.root);
    this.birds.push(b);
    return b;
  }

  addField(f: ParticleField): ParticleField {
    this.scene.add(f.points);
    this.fields.push(f);
    return f;
  }

  addFlame(x: number, y: number, z: number, scale = 1, light = false, color = '#ffb347'): THREE.Sprite {
    const f = makeFlame(scale, color);
    f.position.set(x, y, z);
    this.scene.add(f);
    this.flames.push(f);
    if (light) {
      const l = new THREE.PointLight('#ff9a4a', 6 * scale, 14 * scale, 1.6);
      l.position.set(x, y + 0.3, z);
      this.scene.add(l);
      f.userData.light = l;
    }
    return f;
  }

  remove(obj: THREE.Object3D): void {
    obj.parent?.remove(obj);
    disposeTree(obj);
  }

  removeNPC(n: NPC): void {
    this.npcs = this.npcs.filter((x) => x !== n);
    this.scene.remove(n.char.root);
  }

  removeAnimal(a: Animal): void {
    this.animals = this.animals.filter((x) => x !== a);
    this.scene.remove(a.root);
  }

  // ---------------------------------------------------------------- physics

  heightAt(x: number, z: number): number {
    return this.heightFn(x, z);
  }

  resolve(p: THREE.Vector3, r: number): void {
    for (const c of this.colliders) {
      if (c.kind === 'circle') {
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const d = Math.hypot(dx, dz);
        const min = c.r + r;
        if (d < min && d > 1e-6) {
          p.x = c.x + (dx / d) * min;
          p.z = c.z + (dz / d) * min;
        }
      } else {
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const lx = dx * c.c - dz * c.s;
        const lz = dx * c.s + dz * c.c;
        if (Math.abs(lx) > c.hw + r || Math.abs(lz) > c.hd + r) continue;
        const cx = clamp(lx, -c.hw, c.hw);
        const cz = clamp(lz, -c.hd, c.hd);
        let ox = lx - cx;
        let oz = lz - cz;
        const d = Math.hypot(ox, oz);
        let nx: number;
        let nz: number;
        if (d > 1e-6) {
          if (d >= r) continue;
          nx = cx + (ox / d) * r;
          nz = cz + (oz / d) * r;
        } else {
          // centre inside the box: push out along the shallowest axis
          const px = c.hw - Math.abs(lx);
          const pz = c.hd - Math.abs(lz);
          if (px < pz) {
            nx = Math.sign(lx || 1) * (c.hw + r);
            nz = lz;
          } else {
            nx = lx;
            nz = Math.sign(lz || 1) * (c.hd + r);
          }
        }
        ox = nx;
        oz = nz;
        p.x = c.x + ox * c.c + oz * c.s;
        p.z = c.z - ox * c.s + oz * c.c;
      }
    }
    if (this.bounds) {
      p.x = clamp(p.x, this.bounds.x0, this.bounds.x1);
      p.z = clamp(p.z, this.bounds.z0, this.bounds.z1);
    }
    if (this.circleBounds) {
      const b = this.circleBounds;
      const dx = p.x - b.x;
      const dz = p.z - b.z;
      const d = Math.hypot(dx, dz);
      if (d > b.r - r) {
        p.x = b.x + (dx / d) * (b.r - r);
        p.z = b.z + (dz / d) * (b.r - r);
      }
    }
  }

  // ---------------------------------------------------------------- atmosphere

  private applyAtm(a: AtmState): void {
    const u = this.sky.uniforms;
    u.topColor.value.copy(a.top);
    u.horizonColor.value.copy(a.horizon);
    u.bottomColor.value.copy(a.bottom);
    u.sunColor.value.copy(a.sun);
    u.sunDir.value.copy(a.sunDir);
    u.sunSize.value = a.sunSize;
    u.stars.value = a.stars;
    u.clouds.value = a.clouds;
    u.cloudColor.value.copy(a.cloudColor);
    this.sun.color.copy(a.sun);
    this.sun.intensity = a.sunIntensity;
    this.hemi.color.copy(a.hemiSky);
    this.hemi.groundColor.copy(a.hemiGround);
    this.hemi.intensity = a.hemiIntensity;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(a.fog);
    fog.near = a.fogNear;
    fog.far = a.fogFar;
    this.svc.renderer.toneMappingExposure = a.exposure;
    const light = Math.max(0.22, Math.min(1.15, a.hemiIntensity * 0.62 + a.sunIntensity * 0.14));
    for (const w of this.waters) {
      (w.uniforms.sunDir.value as THREE.Vector3).copy(a.sunDir);
      (w.uniforms.sunColor.value as THREE.Color).copy(a.sun);
      w.uniforms.light.value = light;
    }
  }

  /** Blend to a named or custom atmosphere over `seconds`. */
  setAtmosphere(target: string | Atmosphere, seconds = 0): Promise<void> {
    const to = toState(typeof target === 'string' ? ATMOS[target] : target);
    const from = cloneState(this.atm);
    const token = ++this.atmToken;
    return this.runner.tween(seconds, (t) => {
      if (token !== this.atmToken) return; // a newer transition took over
      lerpState(from, to, t, this.atm);
      this.applyAtm(this.atm);
    });
  }

  // ---------------------------------------------------------------- script helpers

  wait(s: number): Promise<void> {
    return this.runner.wait(s);
  }

  waitUntil(pred: () => boolean): Promise<void> {
    return this.runner.waitUntil(pred);
  }

  tween(s: number, fn: (t: number) => void, ease?: (t: number) => number): Promise<void> {
    return this.runner.tween(s, fn, ease);
  }

  onUpdate(fn: (dt: number, t: number) => void): () => void {
    return this.runner.onUpdate(fn);
  }

  music(theme: MusicTheme | null): void {
    audio.playMusic(theme);
  }

  ambient(name: AmbientName, level: number, fade = 1.5): void {
    audio.setAmbient(name, level, fade);
  }

  sfx(name: Sfx, vol = 1): void {
    audio.play(name, vol);
  }

  toast(text: string, kind: 'xp' | 'info' | 'good' | 'warn' = 'info'): void {
    this.svc.ui.hud.toast(text, kind);
  }

  addXP(n: number, reason?: string): void {
    this.xpEarned += n;
    this.svc.addXP(n, reason);
  }

  get translation(): Translation {
    return this.svc.getSave().profile?.translation ?? 'WEB';
  }

  get playerName(): string {
    return this.svc.getSave().profile?.name ?? 'Traveller';
  }

  posOf(t: Target): THREE.Vector3 {
    if (typeof t === 'function') return t();
    if (t instanceof THREE.Vector3) return t;
    if (t instanceof NPC) return t.position;
    if (t instanceof Animal) return t.position;
    return (t as THREE.Object3D).getWorldPosition(this.tmpV.clone());
  }

  // dialogue ------------------------------------------------------------

  /** A dialogue line spoken by an NPC (animates them while talking). */
  line(who: NPC | string, text: string, ref?: string): Line {
    if (typeof who === 'string') {
      const isMe = who === 'me';
      return { who: isMe ? this.playerName : who, text, ref, color: isMe ? '#7a5cff' : undefined };
    }
    return {
      who: who.name,
      text,
      ref,
      color: who.color,
      onShow: () => {
        for (const n of this.npcs) if (n.char.pose === 'talk') n.char.pose = n.idlePose;
        if (n_canTalk(who.idlePose)) who.char.pose = 'talk';
        who.faceTarget = this.player.position;
      },
    };
  }

  /** Narrator line. */
  n(text: string, ref?: string): Line {
    return { who: '', text, ref };
  }

  async talk(lines: Line[]): Promise<number[]> {
    this.player.frozen = true;
    this.svc.input.setTouchVisible(false);
    try {
      return await this.runner.guard(this.svc.ui.story.dialogue(lines));
    } finally {
      for (const n of this.npcs) if (n.char.pose === 'talk') n.char.pose = n.idlePose;
      this.player.frozen = false;
      this.interactCooldown = 0.35;
      if (!this.disposed) this.svc.input.setTouchVisible(true);
    }
  }

  /** Wait until the player walks up to `target` and presses interact. */
  waitInteract(target: Target, label: string, radius = 3): Promise<void> {
    return this.runner.guard(
      new Promise<void>((resolve) => {
        this.interactables.push({
          pos: () => this.posOf(target),
          radius,
          label,
          enabled: () => true,
          fire: resolve,
          once: true,
        });
      }),
    );
  }

  waitTalk(npc: NPC, label?: string): Promise<void> {
    return this.waitInteract(npc, label ?? `Talk to ${npc.name}`, npc.talkRadius);
  }

  /** Persistent optional interaction (flavour chatter, signs…). Returns a remover. */
  interactable(target: Target, label: string, fn: () => void | Promise<void>, radius = 3, enabled: () => boolean = () => true): () => void {
    const it: Interactable = {
      pos: () => this.posOf(target),
      radius,
      label,
      enabled,
      fire: () => {
        void Promise.resolve(fn()).catch((e) => {
          if (!isAbort(e)) console.error(e);
        });
      },
      once: false,
    };
    this.interactables.push(it);
    return () => {
      it.dead = true;
    };
  }

  /** Optional NPC chatter that cycles through short conversations. */
  chatter(npc: NPC, convos: Line[][], enabled: () => boolean = () => true): () => void {
    let i = 0;
    return this.interactable(npc, `Talk to ${npc.name}`, async () => {
      await this.talk(convos[i % convos.length]);
      i++;
    }, npc.talkRadius, enabled);
  }

  /** Set the current objective text and (optionally) the beacon target. */
  objective(text: string | null, target: Target | null = null, count?: string): void {
    this.svc.ui.hud.setObjective(text, count);
    this.objectiveTarget = target;
    this.objectiveSince = 0;
    this.hinted = false;
    if (text) audio.play('chime', 0.5);
  }

  setTarget(target: Target | null): void {
    this.objectiveTarget = target;
  }

  count(text: string): void {
    this.svc.ui.hud.setCount(text);
  }

  narrate(text: string, ref?: string, min = 0): Promise<void> {
    return this.runner.guard(this.svc.ui.story.narrate(text, ref, min));
  }

  /** Run a cutscene: player frozen, letterbox on, camera in cinematic mode. */
  async cinematic(fn: () => Promise<void>): Promise<void> {
    const { ui, cam, input } = this.svc;
    this.player.frozen = true;
    input.setTouchVisible(false);
    ui.story.letterbox(true);
    ui.hud.show(false);
    cam.beginCinematic();
    try {
      await fn();
    } finally {
      if (!this.disposed) {
        ui.story.letterbox(false);
        ui.hud.show(true);
        cam.release(this.player.position);
        cam.snapBehind(this.player.position, this.player.heading);
        this.player.frozen = false;
        input.setTouchVisible(true);
        this.interactCooldown = 0.35;
      }
    }
  }

  async quiz(who: string, q: QuizQ): Promise<boolean> {
    this.player.frozen = true;
    this.quizTotal++;
    try {
      const ok = await this.runner.guard(this.svc.ui.modal(quizModal(this.svc.ui.root, who, q)));
      if (ok) {
        this.quizCorrect++;
        this.addXP(30, 'Correct answer');
      }
      return ok;
    } finally {
      this.player.frozen = false;
      this.interactCooldown = 0.35;
    }
  }

  /** Memory-verse challenge; records progress and XP. Returns stars. */
  async verse(verseId: string): Promise<number> {
    this.player.frozen = true;
    this.svc.input.setTouchVisible(false);
    try {
      const res = await this.runner.guard(
        this.svc.ui.modal(
          verseChallenge(this.svc.ui.root, {
            verseId,
            translation: this.translation,
            onTranslation: (t) => this.svc.updateSave((s) => (s.profile ? { ...s, profile: { ...s.profile, translation: t } } : s)),
          }),
        ),
      );
      this.verseStars = Math.max(this.verseStars, res.stars);
      this.svc.updateSave((s) => recordVerse(s, verseId, res.stars, Date.now()));
      this.addXP(res.stars * 60, 'Memory verse');
      return res.stars;
    } finally {
      this.player.frozen = false;
      this.interactCooldown = 0.35;
      if (!this.disposed) this.svc.input.setTouchVisible(true);
    }
  }

  /** Hide a scroll fragment at (x, z). Collected by walking into it. */
  fragment(frag: Fragment, x: number, z: number, y?: number): void {
    const b = new Builder();
    b.add(G.cyl(0.13, 0.13, 0.55, 10), '#f4e6c0', { rz: Math.PI / 2 });
    b.add(G.cyl(0.16, 0.16, 0.06, 10), '#8a5a2a', { rz: Math.PI / 2, x: 0.3 });
    b.add(G.cyl(0.16, 0.16, 0.06, 10), '#8a5a2a', { rz: Math.PI / 2, x: -0.3 });
    b.add(G.torus(0.14, 0.02, 4, 10), '#c0392b', { ry: Math.PI / 2 });
    const obj = b.build({ shadows: false });
    const glow = makeFlame(1.4, '#ffe39a');
    glow.scale.set(1.4, 1.4, 1);
    glow.userData.base = 1.0;
    obj.add(glow);
    obj.position.set(x, (y ?? this.heightAt(x, z)) + 0.9, z);
    this.scene.add(obj);
    this.fragmentObjs.push({ frag, obj, taken: false });
  }

  // ---------------------------------------------------------------- loop

  private makeBeacon(): THREE.Group {
    const g = new THREE.Group();
    const beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { time: { value: 0 } },
      vertexShader: /* glsl */ `varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
      fragmentShader: /* glsl */ `varying float vY; uniform float time; void main(){ float a = (1.0 - smoothstep(0.0, 26.0, vY)) * (0.35 + 0.15 * sin(vY * 0.6 - time * 4.0)); gl_FragColor = vec4(1.0, 0.82, 0.4, a); }`,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 26, 12, 1, true), beamMat);
    beam.position.y = 13;
    beam.renderOrder = 3;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), MAT.glow);
    const gc = new Float32Array(gem.geometry.getAttribute('position').count * 3).fill(1);
    for (let i = 0; i < gc.length; i += 3) {
      gc[i] = 1;
      gc[i + 1] = 0.85;
      gc[i + 2] = 0.45;
    }
    gem.geometry.setAttribute('color', new THREE.BufferAttribute(gc, 3));
    gem.position.y = 2.6;
    g.add(beam, gem);
    g.visible = false;
    g.userData.beamMat = beamMat;
    g.userData.gem = gem;
    return g;
  }

  update(dt: number): void {
    if (this.disposed) return;
    const { cam, input, ui } = this.svc;
    this.runner.update(dt);
    if (this.disposed) return;
    const busy = ui.busy;
    if (busy) this.player.frozen = true;
    this.player.update(dt, input, cam, this);
    const pp = this.player.position;
    for (const n of this.npcs) n.update(dt, this, pp);
    for (const a of this.animals) a.update(dt, (x, z) => this.heightAt(x, z));
    for (const b of this.birds) b.update(dt);

    // interactions
    this.interactCooldown = Math.max(0, this.interactCooldown - dt);
    this.interactables = this.interactables.filter((i) => !i.dead);
    let best: Interactable | null = null;
    let bestD = Infinity;
    if (!busy && !this.player.frozen && cam.mode === 'follow') {
      for (const it of this.interactables) {
        if (!it.enabled()) continue;
        const p = it.pos();
        const d = Math.hypot(p.x - pp.x, p.z - pp.z);
        // story-critical (one-shot) interactions win over flavour chatter
        const score = d - (it.once ? 0.75 : 0);
        if (d < it.radius && score < bestD) {
          best = it;
          bestD = score;
        }
      }
    }
    ui.hud.setPrompt(best ? best.label : null, input.isTouch ? '👆' : 'E');
    input.setInteractLabel(best ? best.label.split(' ')[0] : null);
    if (best && this.interactCooldown <= 0 && input.pressed('interact')) {
      if (best.once) best.dead = true;
      audio.play('click');
      best.fire();
    }

    // fragments
    for (const f of this.fragmentObjs) {
      if (f.taken) continue;
      f.obj.rotation.y += dt * 1.6;
      f.obj.position.y += Math.sin(this.runner.time * 2.5 + f.obj.position.x) * 0.004;
      if (f.obj.position.distanceTo(this.tmpV.set(pp.x, pp.y + 0.9, pp.z)) < 1.6) {
        f.taken = true;
        this.scene.remove(f.obj);
        audio.play('pickup');
        audio.play('chime');
        const isNew = !this.fragmentsFound.includes(f.frag.id);
        if (isNew) this.fragmentsFound.push(f.frag.id);
        ui.hud.fact(f.frag.title, f.frag.text, f.frag.ref);
        this.addXP(40, 'Scroll fragment');
        ui.hud.toast(`Scroll fragment ${this.fragmentObjs.filter((x) => x.taken).length}/${this.fragmentObjs.length}`, 'good');
      }
    }

    // objective beacon + screen marker
    this.objectiveSince += dt;
    if (this.objectiveTarget && cam.mode === 'follow' && !busy) {
      const tp = this.posOf(this.objectiveTarget);
      const dist = Math.hypot(tp.x - pp.x, tp.z - pp.z);
      this.beacon.visible = dist > 3;
      this.beacon.position.set(tp.x, this.heightAt(tp.x, tp.z), tp.z);
      const gem = this.beacon.userData.gem as THREE.Mesh;
      gem.rotation.y += dt * 2;
      gem.position.y = 2.6 + Math.sin(this.runner.time * 2) * 0.2;
      (this.beacon.userData.beamMat as THREE.ShaderMaterial).uniforms.time.value = this.runner.time;
      this.updateScreenMarker(tp, dist);
      if (!this.hinted && this.objectiveSince > 40 && dist > 12) {
        this.hinted = true;
        ui.hud.toast('Tip: follow the golden beam ✦', 'info', 4000);
      }
    } else {
      this.beacon.visible = false;
      ui.hud.setMarker(null);
    }

    // environment
    this.sky.update(dt, cam.camera);
    this.rain.update(dt, cam.camera.position);
    for (const f of this.fields) f.update(dt);
    for (const f of this.flames) {
      flickerFlame(f, this.runner.time);
      const l = f.userData.light as THREE.PointLight | undefined;
      if (l) l.intensity = (l.userData.base ?? (l.userData.base = l.intensity)) * (0.85 + Math.sin(this.runner.time * 17 + f.position.x) * 0.1);
    }
    for (const w of this.waters) w.uniforms.time.value = this.runner.time;
    // keep the shadow camera centred on the player
    this.sun.position.copy(pp).addScaledVector(this.atm.sunDir, 90);
    this.sun.target.position.copy(pp);
  }

  private updateScreenMarker(tp: THREE.Vector3, dist: number): void {
    const cam = this.svc.cam.camera;
    const W = window.innerWidth;
    const H = window.innerHeight;
    this.projV.set(tp.x, tp.y + 2.8, tp.z).project(cam);
    const behind = this.projV.z > 1;
    let x = (this.projV.x * 0.5 + 0.5) * W;
    let y = (-this.projV.y * 0.5 + 0.5) * H;
    if (behind) {
      x = W - x;
      y = H - y;
    }
    const margin = 46;
    const on = !behind && x > margin && x < W - margin && y > margin && y < H - margin;
    if (dist < 3) {
      this.svc.ui.hud.setMarker(null);
      return;
    }
    if (!on) {
      const cx = W / 2;
      const cy = H / 2;
      let dx = x - cx;
      let dy = y - cy;
      if (behind && Math.abs(dy) < 1) dy = 1;
      const sx = (cx - margin) / Math.max(1e-3, Math.abs(dx));
      const sy = (cy - margin) / Math.max(1e-3, Math.abs(dy));
      const s = Math.min(sx, sy);
      dx *= s;
      dy *= s;
      x = cx + dx;
      y = cy + dy;
      this.svc.ui.hud.setMarker({ x, y, onScreen: false, angle: Math.atan2(dy, dx) + Math.PI / 4, dist });
    } else {
      this.svc.ui.hud.setMarker({ x, y, onScreen: true, angle: 0, dist });
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.runner.abort();
    audio.stopAllAmbient(0.8);
    const hud = this.svc.ui.hud;
    hud.setObjective(null);
    hud.setPrompt(null);
    hud.setMarker(null);
    hud.clearMeters();
    hud.setBanner(null);
    this.svc.ui.story.letterbox(false);
    disposeTree(this.scene);
    this.scene.clear();
  }
}

function n_canTalk(p: Pose): boolean {
  return p === 'idle' || p === 'talk' || p === 'point' || p === 'carry';
}
