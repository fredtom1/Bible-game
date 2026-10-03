import * as THREE from 'three';
import { Builder, G, part, paintGradientY, MAT, type MatKind } from './geo';
import { angleLerp, clamp, damp } from '../engine/noise';
import { makeFlame, flickerFlame, softTexture } from './Particles';

export type Hair = 'short' | 'long' | 'puffs' | 'braids' | 'bald' | 'afro';
export type Headwear = 'none' | 'headwrap' | 'hood' | 'helmet' | 'crown' | 'veil' | 'keffiyeh';
export type Item =
  | 'none'
  | 'staff'
  | 'spear'
  | 'sling'
  | 'scroll'
  | 'shofar'
  | 'tambourine'
  | 'sword'
  | 'torch'
  | 'basket'
  | 'bread';

export type Pose =
  | 'idle'
  | 'talk'
  | 'kneel'
  | 'pray'
  | 'cheer'
  | 'sit'
  | 'point'
  | 'carry'
  | 'raise'
  | 'throw'
  | 'wave'
  | 'cower'
  | 'blow'
  | 'lie';

export interface Look {
  skin: string;
  robe: string;
  robe2?: string;
  sash?: string;
  hair?: Hair;
  hairColor?: string;
  headwear?: Headwear;
  headwearColor?: string;
  beard?: 'none' | 'short' | 'long';
  beardColor?: string;
  height?: number;
  build?: number;
  item?: Item;
  shield?: boolean;
  armor?: boolean;
  glow?: boolean;
}

export const SKIN_TONES = ['#4a2c1d', '#6b3f26', '#8d5a3b', '#b07650', '#c99470', '#e2b896'];

/** Procedural low-poly humanoid with a small pose/locomotion animator. */
export class Character {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly head = new THREE.Group();
  readonly armL = new THREE.Group();
  readonly armR = new THREE.Group();
  readonly handR = new THREE.Group();
  readonly handL = new THREE.Group();
  private footL!: THREE.Mesh;
  private footR!: THREE.Mesh;
  private eyes: THREE.Object3D[] = [];
  private flame: THREE.Sprite | null = null;
  private halo: THREE.Sprite | null = null;

  speed = 0;
  pose: Pose = 'idle';
  lookTarget: THREE.Vector3 | null = null;
  heading = 0;
  private phase = Math.random() * 10;
  private t = Math.random() * 10;
  private blinkIn = 2 + Math.random() * 3;
  private cur = { bodyY: 0, lean: 0, aLx: 0, aLz: 0.1, aRx: 0, aRz: -0.1, headX: 0, headY: 0 };

  constructor(public look: Look) {
    this.build();
  }

  private build(): void {
    const L = this.look;
    const w = L.build ?? 1;
    const glowKind: MatKind = L.glow ? 'glow' : 'cloth';
    // Torso / robe
    const robeGeo = paintGradientY(
      G.lathe(
        [
          [0.0, 0.07],
          [0.31, 0.08],
          [0.27, 0.45],
          [0.205, 0.84],
          [0.22, 1.08],
          [0.25, 1.24],
          [0.16, 1.32],
          [0.06, 1.36],
        ],
        12,
      ),
      L.robe,
      L.robe2 ?? L.robe,
      0.86,
    );
    const torso = new Builder();
    torso.addPainted(robeGeo, { kind: L.glow ? 'glow' : 'std', sx: w, sz: w * 0.85 });
    torso.add(G.torus(0.208, 0.035, 5, 14), L.sash ?? '#c9a24a', { kind: 'cloth', y: 0.86, rx: Math.PI / 2, sx: w, sy: w * 0.85 });
    torso.add(G.cyl(0.06, 0.065, 0.14, 8), L.skin, { kind: 'skin', y: 1.38 });
    if (L.armor) {
      torso.add(
        G.lathe(
          [
            [0.23, 0.82],
            [0.235, 1.05],
            [0.265, 1.22],
            [0.17, 1.3],
          ],
          12,
        ),
        '#b0803a',
        { kind: 'metal', sx: w * 1.04, sz: w * 0.9 },
      );
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        torso.add(G.box(0.08, 0.3, 0.025), '#8a6230', {
          kind: 'metal',
          x: Math.sin(a) * 0.235 * w,
          z: Math.cos(a) * 0.2 * w,
          y: 0.68,
          ry: a,
        });
      }
    }
    this.body.add(torso.build());

    // Head
    this.head.position.y = 1.43;
    const hb = new Builder();
    hb.add(G.sphere(0.155, 14, 10), L.skin, { kind: 'skin', y: 0.14, sy: 1.08, jitter: 0 });
    hb.add(G.sphere(0.03, 6, 4), L.skin, { kind: 'skin', y: 0.12, z: 0.15, jitter: 0 });
    const hair = L.hair ?? 'short';
    const hc = L.hairColor ?? '#1d1410';
    const cap = (r: number, kind: MatKind = 'std') =>
      hb.add(new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hc, { kind, y: 0.16, z: -0.012, rx: -0.15 });
    if (hair === 'short') cap(0.165);
    if (hair === 'long') {
      cap(0.168);
      hb.add(G.box(0.3, 0.32, 0.08), hc, { y: 0.0, z: -0.12 });
    }
    if (hair === 'afro') {
      hb.add(G.ico(0.215, 1), hc, { y: 0.21, z: -0.04 });
    }
    if (hair === 'puffs') {
      cap(0.166);
      hb.add(G.ico(0.095, 1), hc, { x: 0.13, y: 0.29, z: -0.03 });
      hb.add(G.ico(0.095, 1), hc, { x: -0.13, y: 0.29, z: -0.03 });
    }
    if (hair === 'braids') {
      cap(0.167);
      for (let i = 0; i < 6; i++) {
        const a = -1.1 + (i / 5) * 2.2;
        hb.add(G.cyl(0.022, 0.018, 0.34, 5), hc, { x: Math.sin(a) * 0.13, y: 0.0, z: -0.09 - Math.cos(a) * 0.04 });
      }
    }
    // eyes as their own meshes (so they can blink)
    for (const sx of [-1, 1]) {
      const eye = part(G.sphere(0.024, 6, 5), '#1a1210', 'std', { x: sx * 0.058, y: 0.165, z: 0.135, sz: 0.6 });
      eye.castShadow = false;
      this.head.add(eye);
      this.eyes.push(eye);
    }
    if (L.beard && L.beard !== 'none') {
      const bc = L.beardColor ?? hc;
      if (L.beard === 'short') hb.add(G.sphere(0.13, 10, 6), bc, { y: 0.06, z: 0.045, sy: 0.9, sz: 0.85 });
      else {
        hb.add(G.sphere(0.13, 10, 6), bc, { y: 0.06, z: 0.045, sy: 0.9, sz: 0.85 });
        hb.add(G.cone(0.11, 0.3, 8), bc, { y: -0.12, z: 0.08, rx: Math.PI });
      }
    }
    const hwc = L.headwearColor ?? '#e8dcc0';
    switch (L.headwear ?? 'none') {
      case 'headwrap':
        hb.add(new THREE.SphereGeometry(0.172, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hwc, { kind: 'cloth', y: 0.17, rx: -0.12 });
        hb.add(G.torus(0.162, 0.045, 6, 14), hwc, { kind: 'cloth', y: 0.2, rx: Math.PI / 2 - 0.12 });
        break;
      case 'keffiyeh':
        hb.add(new THREE.SphereGeometry(0.175, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hwc, { kind: 'cloth', y: 0.16, rx: -0.1 });
        hb.add(G.cyl(0.17, 0.27, 0.4, 10, ), hwc, { kind: 'cloth', y: 0.0, z: -0.04, sz: 0.85 });
        hb.add(G.torus(0.165, 0.022, 5, 14), '#2a211b', { y: 0.22, rx: Math.PI / 2 - 0.1 });
        break;
      case 'hood':
        hb.add(new THREE.SphereGeometry(0.19, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.7), hwc, { kind: 'cloth', y: 0.14, z: -0.02, rx: -0.3 });
        hb.add(G.cyl(0.19, 0.26, 0.3, 10), hwc, { kind: 'cloth', y: -0.02, z: -0.06, sz: 0.8 });
        break;
      case 'veil':
        hb.add(new THREE.SphereGeometry(0.182, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.8), hwc, { kind: 'cloth', y: 0.15, z: -0.01, rx: -0.25 });
        hb.add(G.cyl(0.18, 0.3, 0.55, 10), hwc, { kind: 'cloth', y: -0.12, z: -0.07, sz: 0.75 });
        break;
      case 'helmet':
        hb.add(new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#b08038', { kind: 'metal', y: 0.17 });
        hb.add(G.box(0.03, 0.12, 0.3), '#8a3a2a', { y: 0.36, z: -0.02 });
        hb.add(G.cyl(0.19, 0.19, 0.04, 14), '#a07030', { kind: 'metal', y: 0.17 });
        break;
      case 'crown':
        hb.add(G.cyl(0.17, 0.165, 0.07, 14), '#e6b93a', { kind: 'metal', y: 0.3 });
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          hb.add(G.cone(0.03, 0.09, 4), '#f0c84a', { kind: 'metal', x: Math.sin(a) * 0.17, z: Math.cos(a) * 0.17, y: 0.37 });
        }
        break;
    }
    this.head.add(hb.build());
    this.body.add(this.head);

    // Arms (pivot at shoulder)
    const sleeveColor = L.robe2 ?? L.robe;
    for (const [arm, side, hand] of [
      [this.armL, 1, this.handL],
      [this.armR, -1, this.handR],
    ] as const) {
      arm.position.set(side * 0.265 * w, 1.26, 0);
      const ab = new Builder();
      ab.add(G.cyl(0.07, 0.095, 0.5, 7), sleeveColor, { kind: glowKind === 'glow' ? 'glow' : 'std', y: -0.24 });
      ab.add(G.sphere(0.06, 8, 6), L.skin, { kind: 'skin', y: -0.53, jitter: 0 });
      if (L.armor) ab.add(G.sphere(0.1, 8, 5), '#a87a36', { kind: 'metal', y: -0.02, sy: 0.7 });
      arm.add(ab.build());
      hand.position.y = -0.55;
      arm.add(hand);
      this.body.add(arm);
    }
    this.attachItem(L.item ?? 'none');
    if (L.shield) {
      const sb = new Builder();
      sb.add(G.cyl(0.3, 0.3, 0.05, 12), '#7a5a2a', { rz: Math.PI / 2, x: 0.08 });
      sb.add(G.cyl(0.08, 0.08, 0.07, 8), '#c09040', { kind: 'metal', rz: Math.PI / 2, x: 0.1 });
      this.handL.add(sb.build());
    }

    // Feet
    const footColor = '#4a3020';
    this.footL = part(G.box(0.1, 0.06, 0.2), footColor, 'std', { x: 0.1, y: 0.03, z: 0.03 });
    this.footR = part(G.box(0.1, 0.06, 0.2), footColor, 'std', { x: -0.1, y: 0.03, z: 0.03 });
    this.root.add(this.footL, this.footR);
    this.root.add(this.body);

    if (L.glow) {
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: softTexture(), color: '#fff3c8', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }),
      );
      halo.scale.set(3, 3.6, 1);
      halo.position.y = 1.0;
      this.root.add(halo);
      this.halo = halo;
    }
    const s = L.height ?? 1;
    this.root.scale.setScalar(s);
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }

  /** Swap the item in the right hand. */
  attachItem(item: Item): void {
    this.handR.clear();
    this.flame = null;
    if (item === 'none') return;
    const b = new Builder();
    switch (item) {
      case 'staff':
        b.add(G.cyl(0.028, 0.032, 1.9, 6), '#6b4a2b', { y: 0.35 });
        b.add(G.torus(0.07, 0.025, 5, 8, Math.PI * 1.3), '#6b4a2b', { y: 1.32, x: -0.05, rz: 0.3 });
        break;
      case 'spear':
        b.add(G.cyl(0.03, 0.035, 2.6, 6), '#5b4026', { y: 0.6 });
        b.add(G.cone(0.07, 0.35, 5), '#9aa0a8', { kind: 'metal', y: 2.05 });
        break;
      case 'sword':
        b.add(G.box(0.05, 0.75, 0.015), '#c8ccd2', { kind: 'metal', y: 0.45, z: 0.05 });
        b.add(G.box(0.2, 0.04, 0.05), '#a07030', { kind: 'metal', y: 0.06, z: 0.05 });
        break;
      case 'sling':
        b.add(G.cyl(0.006, 0.006, 0.6, 4), '#7a5a3a', { y: -0.3 });
        b.add(G.sphere(0.05, 6, 4), '#5a4030', { y: -0.6 });
        break;
      case 'scroll':
        b.add(G.cyl(0.05, 0.05, 0.3, 8), '#efe0b8', { rz: Math.PI / 2, z: 0.05 });
        b.add(G.cyl(0.06, 0.06, 0.04, 8), '#7a4a2a', { rz: Math.PI / 2, x: 0.17, z: 0.05 });
        b.add(G.cyl(0.06, 0.06, 0.04, 8), '#7a4a2a', { rz: Math.PI / 2, x: -0.17, z: 0.05 });
        break;
      case 'shofar':
        b.add(G.torus(0.18, 0.04, 6, 10, Math.PI * 0.9), '#d8c39a', { z: 0.12, y: 0.1, ry: Math.PI / 2 });
        b.add(G.cone(0.07, 0.12, 8), '#cbb48a', { z: 0.12, y: 0.28, rx: Math.PI });
        break;
      case 'tambourine':
        b.add(G.cyl(0.16, 0.16, 0.05, 12), '#c9a76a', { rx: Math.PI / 2, z: 0.08 });
        b.add(G.cyl(0.15, 0.15, 0.052, 12), '#efe2c4', { rx: Math.PI / 2, z: 0.08 });
        break;
      case 'torch': {
        b.add(G.cyl(0.03, 0.025, 0.6, 6), '#5b3a22', { y: 0.2 });
        b.add(G.cyl(0.05, 0.035, 0.1, 6), '#2a1a10', { y: 0.5 });
        const f = makeFlame(0.35, '#ffa040');
        f.position.y = 0.66;
        this.handR.add(f);
        this.flame = f;
        break;
      }
      case 'basket':
        b.add(G.cyl(0.22, 0.16, 0.18, 10), '#b08850', { y: 0.05, z: 0.22 });
        b.add(G.sphere(0.13, 8, 6), '#d9a85e', { y: 0.12, z: 0.22, sy: 0.5 });
        break;
      case 'bread':
        b.add(G.sphere(0.09, 8, 6), '#d9a85e', { z: 0.06, sy: 0.6 });
        break;
    }
    this.handR.add(b.build());
  }

  setOpacity(o: number): void {
    this.root.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) {
        m.visible = o > 0.02;
      }
    });
  }

  update(dt: number): void {
    this.t += dt;
    const sp = this.speed;
    const moving = sp > 0.15;
    if (moving) this.phase += dt * (sp * 1.55 + 1.5);
    const amt = clamp(sp / 4.2, 0, 1.7);
    const swing = moving ? Math.sin(this.phase) : 0;
    const breathe = Math.sin(this.t * 1.8) * 0.012;

    // pose targets
    let bodyY = 0;
    let lean = moving ? amt * 0.08 : 0;
    let aLx = -swing * 0.7 * amt;
    let aRx = swing * 0.7 * amt;
    let aLz = 0.1;
    let aRz = -0.1;
    let headX = 0;
    let headY = 0;
    let footVisible = true;
    const t = this.t;
    switch (this.pose) {
      case 'talk':
        aRx = -0.5 - Math.sin(t * 3.1) * 0.25;
        aRz = -0.25;
        headX = Math.sin(t * 4) * 0.05;
        break;
      case 'kneel':
        bodyY = -0.42;
        aLx = aRx = -1.0;
        aLz = 0.15;
        aRz = -0.15;
        headX = 0.25;
        footVisible = false;
        break;
      case 'pray':
        bodyY = -0.42;
        aLx = aRx = -2.5;
        aLz = 0.35;
        aRz = -0.35;
        headX = -0.3;
        footVisible = false;
        break;
      case 'cheer':
        bodyY = Math.abs(Math.sin(t * 6)) * 0.12;
        aLx = aRx = -2.8;
        aLz = 0.5 + Math.sin(t * 8) * 0.15;
        aRz = -0.5 - Math.sin(t * 8) * 0.15;
        headX = -0.2;
        break;
      case 'sit':
        bodyY = -0.52;
        aLx = aRx = -0.5;
        footVisible = false;
        break;
      case 'point':
        aRx = -1.5;
        aRz = -0.1;
        break;
      case 'carry':
        aLx = aRx = -1.0;
        aLz = 0.05;
        aRz = -0.05;
        break;
      case 'raise':
        aRx = -2.6;
        aRz = -0.25;
        aLx = -1.3 + Math.sin(t * 2) * 0.05;
        aLz = 0.5;
        headX = -0.25;
        break;
      case 'throw':
        aRx = -2.7 + Math.sin(t * 16) * 0.35;
        aRz = -0.5 + Math.cos(t * 16) * 0.35;
        aLx = -0.9;
        lean = -0.05;
        break;
      case 'wave':
        aRx = -2.6;
        aRz = -0.4 + Math.sin(t * 9) * 0.35;
        break;
      case 'cower':
        bodyY = -0.12;
        aLx = aRx = -2.1;
        aLz = -0.3;
        aRz = 0.3;
        headX = 0.4;
        lean = 0.2;
        break;
      case 'blow':
        aRx = -2.0;
        aRz = 0.35;
        aLx = -1.7;
        aLz = -0.35;
        headX = -0.35;
        break;
      case 'lie':
        aLz = 0.4;
        aRz = -0.4;
        break;
      case 'idle':
      default:
        aLz = 0.1 + breathe;
        aRz = -0.1 - breathe;
        break;
    }
    if (this.lookTarget && (this.pose === 'idle' || this.pose === 'talk' || this.pose === 'point')) {
      const wp = new THREE.Vector3();
      this.head.getWorldPosition(wp);
      const dx = this.lookTarget.x - wp.x;
      const dz = this.lookTarget.z - wp.z;
      const want = Math.atan2(dx, dz) - this.root.rotation.y;
      let d = want;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      headY = clamp(d, -1.0, 1.0);
    }
    const k = damp(10, dt);
    const c = this.cur;
    c.bodyY += (bodyY - c.bodyY) * k;
    c.lean += (lean - c.lean) * k;
    c.aLx += (aLx - c.aLx) * (moving && this.pose === 'idle' ? 1 : k);
    c.aRx += (aRx - c.aRx) * (moving && this.pose === 'idle' ? 1 : k);
    c.aLz += (aLz - c.aLz) * k;
    c.aRz += (aRz - c.aRz) * k;
    c.headX += (headX - c.headX) * k;
    c.headY = angleLerp(c.headY, headY, k);

    const bob = moving ? Math.abs(Math.sin(this.phase)) * 0.05 * Math.min(1, amt) : breathe;
    this.body.position.y = c.bodyY + bob;
    this.body.rotation.x = c.lean;
    this.armL.rotation.set(c.aLx, 0, c.aLz);
    this.armR.rotation.set(c.aRx, 0, c.aRz);
    this.head.rotation.set(c.headX, c.headY, 0);
    this.footL.visible = this.footR.visible = footVisible;
    const stride = moving ? 0.2 * Math.min(1.3, amt) : 0;
    this.footL.position.z = 0.03 + Math.sin(this.phase) * stride;
    this.footR.position.z = 0.03 - Math.sin(this.phase) * stride;
    this.footL.position.y = 0.03 + Math.max(0, Math.cos(this.phase)) * 0.07 * (moving ? 1 : 0);
    this.footR.position.y = 0.03 + Math.max(0, -Math.cos(this.phase)) * 0.07 * (moving ? 1 : 0);

    // blink
    this.blinkIn -= dt;
    const closed = this.blinkIn < 0;
    for (const e of this.eyes) e.scale.y = closed ? 0.12 : 1;
    if (this.blinkIn < -0.12) this.blinkIn = 2 + Math.random() * 4;

    if (this.flame) flickerFlame(this.flame, this.t);
    if (this.halo) this.halo.material.opacity = 0.65 + Math.sin(this.t * 2) * 0.15;
  }

  /** Turn smoothly towards a heading (radians, 0 = +Z). */
  turnTo(heading: number, dt: number, rate = 10): void {
    this.heading = angleLerp(this.heading, heading, damp(rate, dt));
    this.root.rotation.y = this.heading;
  }

  face(x: number, z: number): void {
    const p = this.root.position;
    this.heading = Math.atan2(x - p.x, z - p.z);
    this.root.rotation.y = this.heading;
  }
}

/** Text label sprite (name tags, gate signs). */
export function makeLabel(text: string, opts: { color?: string; bg?: string; size?: number; sub?: string } = {}): THREE.Sprite {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = 'bold 44px Nunito, system-ui, sans-serif';
  const subFont = '600 30px Nunito, system-ui, sans-serif';
  g.font = font;
  const w1 = g.measureText(text).width;
  g.font = subFont;
  const w2 = opts.sub ? g.measureText(opts.sub).width : 0;
  const W = Math.ceil(Math.max(w1, w2) + 48);
  const H = opts.sub ? 112 : 68;
  c.width = W;
  c.height = H;
  g.fillStyle = opts.bg ?? 'rgba(15,10,30,0.72)';
  const r = 18;
  g.beginPath();
  g.roundRect(0, 0, W, H, r);
  g.fill();
  g.font = font;
  g.fillStyle = opts.color ?? '#fff6dc';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, W / 2, opts.sub ? 38 : H / 2 + 2);
  if (opts.sub) {
    g.font = subFont;
    g.fillStyle = '#f3c86a';
    g.fillText(opts.sub, W / 2, 82);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true });
  const s = new THREE.Sprite(mat);
  const scale = (opts.size ?? 0.45) / 68;
  s.scale.set(W * scale, H * scale, 1);
  s.renderOrder = 5;
  return s;
}

export { MAT };
