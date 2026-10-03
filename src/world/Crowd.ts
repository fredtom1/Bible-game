import * as THREE from 'three';
import { G, MAT, paintGradientY, paint } from './geo';
import { SKIN_TONES } from './Character';
import type { Rng } from '../engine/noise';

export interface Person {
  x: number;
  z: number;
  heading: number;
  sitting: boolean;
  speed: number;
  tx?: number;
  tz?: number;
  phase: number;
  scale: number;
  cheer: boolean;
  visible: boolean;
}

const ROBES = ['#c9b48a', '#a8402e', '#2f6f8f', '#7a5a3a', '#efe6d2', '#6a3a5a', '#3f7a4a', '#b08a52', '#8a8a92', '#4a3a30'];
const WRAPS = ['#e8dcc0', '#c9b48a', '#efe6d2', '#8a6a42', '#5a4436', '#d8c8a8'];

/**
 * Hundreds of simple people drawn with three instanced meshes (body, head,
 * head covering). Used for armies, camps, marching crowds and the 5,000.
 */
export class Crowd {
  readonly group = new THREE.Group();
  readonly people: Person[] = [];
  private bodies: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private wraps: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private t = 0;

  constructor(count: number, rng: Rng, opts: { robes?: string[]; armor?: boolean } = {}) {
    const bodyGeo = paintGradientY(
      G.lathe(
        [
          [0, 0.05],
          [0.3, 0.06],
          [0.25, 0.5],
          [0.2, 0.85],
          [0.24, 1.22],
          [0.12, 1.34],
          [0.0, 1.36],
        ],
        8,
      ),
      '#ffffff',
      '#e8e8e8',
      0.86,
    );
    const headGeo = paint(G.sphere(0.155, 8, 6), '#ffffff', 0);
    headGeo.translate(0, 1.56, 0);
    const wrapGeo = paint(new THREE.SphereGeometry(0.175, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), '#ffffff', 0);
    wrapGeo.translate(0, 1.6, -0.01);
    this.bodies = new THREE.InstancedMesh(bodyGeo, MAT.std, count);
    this.heads = new THREE.InstancedMesh(headGeo, MAT.skin, count);
    this.wraps = new THREE.InstancedMesh(wrapGeo, opts.armor ? MAT.metal : MAT.cloth, count);
    const robes = opts.robes ?? ROBES;
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      this.bodies.setColorAt(i, c.set(robes[Math.floor(rng() * robes.length)]));
      this.heads.setColorAt(i, c.set(SKIN_TONES[1 + Math.floor(rng() * 4)]));
      this.wraps.setColorAt(i, c.set(opts.armor ? '#b08038' : WRAPS[Math.floor(rng() * WRAPS.length)]));
      this.people.push({
        x: 0,
        z: 0,
        heading: 0,
        sitting: false,
        speed: 0,
        phase: rng() * 10,
        scale: 0.8 + rng() * 0.25,
        cheer: false,
        visible: true,
      });
    }
    for (const im of [this.bodies, this.heads, this.wraps]) {
      im.castShadow = true;
      im.receiveShadow = false;
      im.frustumCulled = false;
      this.group.add(im);
    }
  }

  get count(): number {
    return this.people.length;
  }

  place(i: number, x: number, z: number, heading: number, sitting = false): void {
    const p = this.people[i];
    p.x = x;
    p.z = z;
    p.heading = heading;
    p.sitting = sitting;
    p.tx = undefined;
    p.tz = undefined;
  }

  walkTo(i: number, x: number, z: number, speed: number): void {
    const p = this.people[i];
    p.tx = x;
    p.tz = z;
    p.speed = speed;
  }

  update(dt: number, ground: (x: number, z: number) => number): void {
    this.t += dt;
    for (let i = 0; i < this.people.length; i++) {
      const p = this.people[i];
      let moving = false;
      if (p.tx !== undefined && p.tz !== undefined) {
        const dx = p.tx - p.x;
        const dz = p.tz - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.2) {
          const st = Math.min(d, p.speed * dt);
          p.x += (dx / d) * st;
          p.z += (dz / d) * st;
          p.heading = Math.atan2(dx, dz);
          moving = true;
        } else {
          p.tx = undefined;
          p.tz = undefined;
        }
      }
      const bob = moving ? Math.abs(Math.sin(this.t * 8 + p.phase)) * 0.06 : p.cheer ? Math.abs(Math.sin(this.t * 7 + p.phase)) * 0.25 : 0;
      const y = ground(p.x, p.z) + (p.sitting ? -0.5 : 0) + bob;
      this.v.set(p.x, y, p.z);
      this.e.set(0, p.heading, moving ? Math.sin(this.t * 8 + p.phase) * 0.04 : 0);
      this.q.setFromEuler(this.e);
      const s = p.visible ? p.scale : 0.0001;
      this.s.set(s, s, s);
      this.m.compose(this.v, this.q, this.s);
      this.bodies.setMatrixAt(i, this.m);
      this.heads.setMatrixAt(i, this.m);
      this.wraps.setMatrixAt(i, this.m);
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    this.wraps.instanceMatrix.needsUpdate = true;
  }
}
