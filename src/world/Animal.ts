import * as THREE from 'three';
import { Builder, G } from './geo';
import { angleLerp, damp } from '../engine/noise';

export type Species = 'sheep' | 'camel' | 'elephant' | 'giraffe' | 'lion' | 'deer' | 'horse' | 'donkey' | 'goat';

interface Spec {
  bodyLen: number;
  bodyH: number;
  bodyW: number;
  legLen: number;
  legR: number;
  color: string;
  legColor?: string;
  speed: number;
  extras: (b: Builder, s: Spec) => void;
  headAt: [number, number];
}

const SPECS: Record<Species, Spec> = {
  sheep: {
    bodyLen: 0.9, bodyH: 0.6, bodyW: 0.6, legLen: 0.38, legR: 0.045, color: '#f2efe6', legColor: '#2c2420', speed: 2.2,
    headAt: [0.55, 0.75],
    extras: (b) => {
      b.add(G.box(0.2, 0.22, 0.28), '#2c2420', { z: 0.58, y: 0.75 });
      b.add(G.box(0.14, 0.05, 0.08), '#2c2420', { x: 0.13, z: 0.55, y: 0.8, rz: -0.4 });
      b.add(G.box(0.14, 0.05, 0.08), '#2c2420', { x: -0.13, z: 0.55, y: 0.8, rz: 0.4 });
    },
  },
  goat: {
    bodyLen: 0.85, bodyH: 0.5, bodyW: 0.42, legLen: 0.45, legR: 0.04, color: '#6b5440', speed: 2.4, headAt: [0.55, 0.85],
    extras: (b) => {
      b.add(G.box(0.18, 0.2, 0.3), '#5a4433', { z: 0.6, y: 0.85, rx: 0.3 });
      b.add(G.cone(0.03, 0.22, 4), '#cfc2a8', { x: 0.06, z: 0.52, y: 1.02, rx: -0.6 });
      b.add(G.cone(0.03, 0.22, 4), '#cfc2a8', { x: -0.06, z: 0.52, y: 1.02, rx: -0.6 });
      b.add(G.cone(0.04, 0.1, 4), '#d8d0c0', { z: 0.7, y: 0.68, rx: Math.PI });
    },
  },
  camel: {
    bodyLen: 1.5, bodyH: 0.75, bodyW: 0.6, legLen: 1.1, legR: 0.07, color: '#c9a26b', speed: 2.6, headAt: [1.25, 2.25],
    extras: (b) => {
      b.add(G.sphere(0.38, 8, 6), '#c49c64', { y: 1.75, z: -0.1, sy: 0.9 });
      b.add(G.cyl(0.12, 0.15, 0.95, 6), '#c9a26b', { y: 1.8, z: 0.85, rx: 0.85 });
      b.add(G.box(0.22, 0.24, 0.48), '#c49c64', { y: 2.22, z: 1.3 });
    },
  },
  elephant: {
    bodyLen: 2.2, bodyH: 1.5, bodyW: 1.35, legLen: 1.1, legR: 0.22, color: '#8e8e94', speed: 1.8, headAt: [1.45, 2.1],
    extras: (b) => {
      b.add(G.sphere(0.62, 10, 8), '#8a8a90', { y: 2.05, z: 1.35 });
      b.add(G.cyl(0.08, 0.17, 1.2, 7), '#85858b', { y: 1.35, z: 1.85, rx: 0.15 });
      b.add(G.cyl(0.62, 0.62, 0.06, 10), '#7e7e86', { x: 0.55, y: 2.05, z: 1.15, rz: Math.PI / 2, ry: -0.4 });
      b.add(G.cyl(0.62, 0.62, 0.06, 10), '#7e7e86', { x: -0.55, y: 2.05, z: 1.15, rz: Math.PI / 2, ry: 0.4 });
      b.add(G.cone(0.06, 0.6, 6), '#f2ead8', { x: 0.24, y: 1.6, z: 1.85, rx: 1.9 });
      b.add(G.cone(0.06, 0.6, 6), '#f2ead8', { x: -0.24, y: 1.6, z: 1.85, rx: 1.9 });
    },
  },
  giraffe: {
    bodyLen: 1.4, bodyH: 0.8, bodyW: 0.6, legLen: 1.5, legR: 0.07, color: '#e1b05a', speed: 2.6, headAt: [1.3, 4.1],
    extras: (b) => {
      b.add(G.cyl(0.12, 0.2, 2.0, 7), '#e1b05a', { y: 2.95, z: 0.95, rx: 0.42 });
      b.add(G.box(0.24, 0.26, 0.5), '#dca852', { y: 3.95, z: 1.45 });
      b.add(G.cyl(0.03, 0.03, 0.2, 4), '#6b4a2a', { x: 0.08, y: 4.16, z: 1.3 });
      b.add(G.cyl(0.03, 0.03, 0.2, 4), '#6b4a2a', { x: -0.08, y: 4.16, z: 1.3 });
      for (let i = 0; i < 14; i++) {
        b.add(G.box(0.16, 0.16, 0.02), '#8a5a2a', {
          x: (i % 2 ? 1 : -1) * 0.31,
          y: 1.75 + ((i * 37) % 5) * 0.08,
          z: -0.55 + (i / 14) * 1.1,
          ry: Math.PI / 2,
        });
      }
    },
  },
  lion: {
    bodyLen: 1.3, bodyH: 0.6, bodyW: 0.55, legLen: 0.55, legR: 0.08, color: '#c99a52', speed: 3.2, headAt: [0.85, 1.1],
    extras: (b) => {
      b.add(G.ico(0.45, 1), '#7a4a22', { y: 1.08, z: 0.8 });
      b.add(G.box(0.36, 0.36, 0.4), '#c99a52', { y: 1.05, z: 1.02 });
      b.add(G.box(0.2, 0.14, 0.16), '#b08446', { y: 0.96, z: 1.24 });
      b.add(G.box(0.08, 0.06, 0.04), '#2a1a12', { y: 1.02, z: 1.33 });
      b.add(G.cyl(0.025, 0.03, 0.8, 4), '#c99a52', { y: 0.9, z: -0.95, rx: -0.8 });
      b.add(G.sphere(0.07, 6, 4), '#6a3a1a', { y: 1.2, z: -1.2 });
    },
  },
  deer: {
    bodyLen: 1.0, bodyH: 0.5, bodyW: 0.42, legLen: 0.8, legR: 0.04, color: '#a8724a', speed: 3, headAt: [0.75, 1.65],
    extras: (b) => {
      b.add(G.cyl(0.08, 0.12, 0.6, 6), '#a8724a', { y: 1.4, z: 0.55, rx: 0.5 });
      b.add(G.box(0.16, 0.18, 0.34), '#9a6640', { y: 1.65, z: 0.75 });
      for (const s of [1, -1]) {
        b.add(G.cyl(0.015, 0.02, 0.4, 4), '#d8c8a8', { x: s * 0.08, y: 1.9, z: 0.68, rz: -s * 0.4 });
        b.add(G.cyl(0.012, 0.015, 0.18, 4), '#d8c8a8', { x: s * 0.16, y: 2.0, z: 0.72, rz: s * 0.4 });
      }
      b.add(G.sphere(0.07, 6, 4), '#f2ead8', { y: 1.2, z: -0.52 });
    },
  },
  horse: {
    bodyLen: 1.5, bodyH: 0.7, bodyW: 0.55, legLen: 0.95, legR: 0.07, color: '#6b4428', speed: 4, headAt: [1.2, 2.0],
    extras: (b, s) => {
      b.add(G.cyl(0.13, 0.2, 0.8, 7), s.color, { y: 1.75, z: 0.85, rx: 0.6 });
      b.add(G.box(0.22, 0.26, 0.55), s.color, { y: 2.0, z: 1.22, rx: 0.5 });
      b.add(G.box(0.05, 0.5, 0.5), '#2a1a12', { y: 1.95, z: 0.8, rx: 0.6 });
      b.add(G.cyl(0.04, 0.08, 0.7, 5), '#2a1a12', { y: 1.15, z: -0.9, rx: -0.5 });
    },
  },
  donkey: {
    bodyLen: 1.1, bodyH: 0.6, bodyW: 0.48, legLen: 0.65, legR: 0.06, color: '#8b8580', speed: 2.4, headAt: [0.9, 1.5],
    extras: (b, s) => {
      b.add(G.cyl(0.12, 0.17, 0.55, 6), s.color, { y: 1.3, z: 0.65, rx: 0.7 });
      b.add(G.box(0.2, 0.22, 0.45), s.color, { y: 1.48, z: 0.92, rx: 0.4 });
      b.add(G.cone(0.05, 0.3, 4), s.color, { x: 0.07, y: 1.75, z: 0.8 });
      b.add(G.cone(0.05, 0.3, 4), s.color, { x: -0.07, y: 1.75, z: 0.8 });
    },
  },
};

/** A walking animal with simple wander/follow/goto behaviour. */
export class Animal {
  readonly root = new THREE.Group();
  readonly legs: THREE.Group[] = [];
  readonly species: Species;
  readonly spec: Spec;
  heading = Math.random() * Math.PI * 2;
  speed = 0;
  mode: 'idle' | 'wander' | 'follow' | 'goto' = 'wander';
  home = new THREE.Vector3();
  wanderRadius = 12;
  followTarget: THREE.Object3D | null = null;
  followDist = 2.2;
  gotoTarget = new THREE.Vector3();
  private wanderGoal = new THREE.Vector3();
  private goalSet = false;
  private wait = Math.random() * 3;
  private phase = Math.random() * 6;
  arrived = false;
  /** Extra data for game logic (pair id, delivered…). */
  data: Record<string, unknown> = {};

  constructor(species: Species, scale = 1, color?: string) {
    this.species = species;
    const base = SPECS[species];
    this.spec = color ? { ...base, color } : base;
    const s = this.spec;
    const b = new Builder();
    const bodyY = s.legLen + s.bodyH / 2;
    if (species === 'sheep') b.add(G.ico(0.5, 1), s.color, { y: bodyY + 0.05, sx: s.bodyW * 1.9, sy: s.bodyH * 1.7, sz: s.bodyLen * 1.3, jitter: 0.08 });
    else b.add(G.box(s.bodyW, s.bodyH, s.bodyLen), s.color, { y: bodyY });
    s.extras(b, s);
    this.root.add(b.build());
    const lx = s.bodyW / 2 - s.legR;
    const lz = s.bodyLen / 2 - s.legR * 1.5;
    for (const [x, z] of [
      [lx, lz],
      [-lx, lz],
      [lx, -lz],
      [-lx, -lz],
    ]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, s.legLen, z);
      const lb = new Builder();
      lb.add(G.cyl(s.legR, s.legR * 0.85, s.legLen, 6), s.legColor ?? s.color, { y: -s.legLen / 2 });
      lb.add(G.box(s.legR * 2.2, 0.06, s.legR * 2.4), '#2a2018', { y: -s.legLen + 0.03 });
      pivot.add(lb.build());
      this.root.add(pivot);
      this.legs.push(pivot);
    }
    this.root.scale.setScalar(scale);
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  update(dt: number, ground: (x: number, z: number) => number): void {
    const p = this.root.position;
    let targetSpeed = 0;
    let goal: THREE.Vector3 | null = null;
    if (this.mode === 'wander') {
      if (!this.goalSet) {
        this.wanderGoal.set(p.x, 0, p.z);
        this.goalSet = true;
      }
      const d = Math.hypot(this.wanderGoal.x - p.x, this.wanderGoal.z - p.z);
      if (d < 0.6) {
        this.wait -= dt;
        if (this.wait <= 0) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * this.wanderRadius;
          this.wanderGoal.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
          this.wait = 2 + Math.random() * 5;
        }
      } else {
        goal = this.wanderGoal;
        targetSpeed = this.spec.speed * 0.5;
      }
    } else if (this.mode === 'follow' && this.followTarget) {
      const tp = this.followTarget.position;
      const d = Math.hypot(tp.x - p.x, tp.z - p.z);
      if (d > this.followDist) {
        goal = tp;
        targetSpeed = Math.min(this.spec.speed * 2.4, (d - this.followDist) * 2.5 + 1.5);
      }
    } else if (this.mode === 'goto') {
      const d = Math.hypot(this.gotoTarget.x - p.x, this.gotoTarget.z - p.z);
      this.arrived = d < 0.5;
      if (!this.arrived) {
        goal = this.gotoTarget;
        targetSpeed = this.spec.speed;
      }
    }
    if (goal) {
      const want = Math.atan2(goal.x - p.x, goal.z - p.z);
      this.heading = angleLerp(this.heading, want, damp(5, dt));
    }
    this.speed += (targetSpeed - this.speed) * damp(5, dt);
    p.x += Math.sin(this.heading) * this.speed * dt;
    p.z += Math.cos(this.heading) * this.speed * dt;
    p.y = ground(p.x, p.z);
    this.root.rotation.y = this.heading;
    // legs: diagonal pairs swing together
    if (this.speed > 0.05) this.phase += dt * (this.speed * 3.2 + 2);
    const amp = Math.min(0.6, this.speed * 0.25);
    const sw = Math.sin(this.phase) * amp;
    this.legs[0].rotation.x = sw;
    this.legs[3].rotation.x = sw;
    this.legs[1].rotation.x = -sw;
    this.legs[2].rotation.x = -sw;
  }
}

/** A small flapping bird (doves, sparrows). */
export class Bird {
  readonly root = new THREE.Group();
  private wings: THREE.Group[] = [];
  private t = Math.random() * 10;
  path: ((t: number) => THREE.Vector3) | null = null;

  constructor(color = '#f6f4ee', scale = 1) {
    const b = new Builder();
    b.add(G.sphere(0.12, 8, 6), color, { sz: 1.8 });
    b.add(G.sphere(0.08, 8, 6), color, { z: 0.2, y: 0.06 });
    b.add(G.cone(0.03, 0.08, 4), '#e0a040', { z: 0.29, y: 0.05, rx: Math.PI / 2 });
    b.add(G.box(0.16, 0.02, 0.14), color, { z: -0.26 });
    this.root.add(b.build());
    for (const s of [1, -1]) {
      const w = new THREE.Group();
      const wb = new Builder();
      wb.add(G.box(0.36, 0.02, 0.18), color, { x: s * 0.18 });
      w.add(wb.build());
      this.root.add(w);
      this.wings.push(w);
    }
    this.root.scale.setScalar(scale);
  }

  update(dt: number): void {
    this.t += dt;
    const f = Math.sin(this.t * 16) * 0.8;
    this.wings[0].rotation.z = f;
    this.wings[1].rotation.z = -f;
    if (this.path) {
      const p = this.path(this.t);
      const n = this.path(this.t + 0.05);
      this.root.position.copy(p);
      this.root.lookAt(n);
    }
  }

  setTime(t: number): void {
    this.t = t;
  }
}
