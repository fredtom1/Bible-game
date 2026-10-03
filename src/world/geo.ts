import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Rng } from '../engine/noise';

/**
 * Low-poly art pipeline: every mesh uses vertex colours and one of a handful
 * of shared materials, so static scenery can be merged into very few draw
 * calls (important for phones).
 */
export type MatKind = 'std' | 'metal' | 'cloth' | 'glow' | 'skin';

function shared<T extends THREE.Material>(m: T): T {
  m.userData.shared = true;
  return m;
}

export const MAT: Record<MatKind, THREE.Material> = {
  std: shared(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 })),
  skin: shared(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: false, roughness: 0.75, metalness: 0 })),
  metal: shared(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.35, metalness: 0.75 })),
  cloth: shared(
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0, side: THREE.DoubleSide }),
  ),
  glow: shared(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })),
};

const tmpColor = new THREE.Color();

/** Bake a solid (optionally jittered) colour into a geometry. */
export function paint(
  geo: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  jitter = 0,
  rng: Rng = Math.random,
): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  g.deleteAttribute('uv1');
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const count = g.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  const base = new THREE.Color(color);
  for (let i = 0; i < count; i += 3) {
    tmpColor.copy(base);
    if (jitter > 0) tmpColor.offsetHSL(0, 0, (rng() - 0.5) * jitter);
    for (let k = 0; k < 3 && i + k < count; k++) {
      colors[(i + k) * 3] = tmpColor.r;
      colors[(i + k) * 3 + 1] = tmpColor.g;
      colors[(i + k) * 3 + 2] = tmpColor.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Colour vertices by height between two colours (e.g. two-tone robe). */
export function paintGradientY(
  geo: THREE.BufferGeometry,
  bottom: THREE.ColorRepresentation,
  top: THREE.ColorRepresentation,
  splitY: number,
): THREE.BufferGeometry {
  const g = paint(geo, bottom);
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color') as THREE.BufferAttribute;
  const cTop = new THREE.Color(top);
  for (let i = 0; i < pos.count; i += 3) {
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    if (cy > splitY) for (let k = 0; k < 3; k++) col.setXYZ(i + k, cTop.r, cTop.g, cTop.b);
  }
  return g;
}

/** Randomly displace vertices for an organic, hand-made look. */
export function roughen(geo: THREE.BufferGeometry, amount: number, rng: Rng): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const seen = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let d = seen.get(key);
    if (!d) {
      d = [(rng() - 0.5) * amount, (rng() - 0.5) * amount, (rng() - 0.5) * amount];
      seen.set(key, d);
    }
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  geo.computeVertexNormals();
  return geo;
}

export interface PartOpts {
  kind?: MatKind;
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  s?: number;
  jitter?: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function localMatrix(o: PartOpts): THREE.Matrix4 {
  _e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
  _q.setFromEuler(_e);
  _p.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  const s = o.s ?? 1;
  _s.set((o.sx ?? 1) * s, (o.sy ?? 1) * s, (o.sz ?? 1) * s);
  return _m.compose(_p, _q, _s);
}

/**
 * Collects coloured parts under a transform stack and merges them into one
 * mesh per material kind.
 */
export class Builder {
  private parts: Partial<Record<MatKind, THREE.BufferGeometry[]>> = {};
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  rng: Rng;

  constructor(rng: Rng = Math.random) {
    this.rng = rng;
  }

  get top(): THREE.Matrix4 {
    return this.stack[this.stack.length - 1];
  }

  push(o: PartOpts): this {
    this.stack.push(this.top.clone().multiply(localMatrix(o)));
    return this;
  }

  pop(): this {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }

  /** Run `fn` inside a pushed transform. */
  at(o: PartOpts, fn: () => void): this {
    this.push(o);
    try {
      fn();
    } finally {
      this.pop();
    }
    return this;
  }

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, o: PartOpts = {}): this {
    const g = paint(geo, color, o.jitter ?? 0.05, this.rng);
    g.applyMatrix4(localMatrix(o));
    g.applyMatrix4(this.top);
    const kind = o.kind ?? 'std';
    (this.parts[kind] ??= []).push(g);
    return this;
  }

  /** Add an already-painted geometry (keeps its colours). */
  addPainted(geo: THREE.BufferGeometry, o: PartOpts = {}): this {
    geo.applyMatrix4(localMatrix(o));
    geo.applyMatrix4(this.top);
    (this.parts[o.kind ?? 'std'] ??= []).push(geo);
    return this;
  }

  get empty(): boolean {
    return Object.values(this.parts).every((p) => !p || p.length === 0);
  }

  build(opts: { shadows?: boolean; receive?: boolean } = {}): THREE.Group {
    const group = new THREE.Group();
    for (const [kind, list] of Object.entries(this.parts) as [MatKind, THREE.BufferGeometry[]][]) {
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, MAT[kind]);
      mesh.castShadow = (opts.shadows ?? true) && kind !== 'glow';
      mesh.receiveShadow = opts.receive ?? true;
      group.add(mesh);
    }
    this.parts = {};
    return group;
  }
}

/** Single coloured mesh (for animated parts). */
export function part(
  geo: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  kind: MatKind = 'std',
  o: PartOpts = {},
): THREE.Mesh {
  const g = paint(geo, color, o.jitter ?? 0.03);
  const mesh = new THREE.Mesh(g, MAT[kind]);
  mesh.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  mesh.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
  const s = o.s ?? 1;
  mesh.scale.set((o.sx ?? 1) * s, (o.sy ?? 1) * s, (o.sz ?? 1) * s);
  mesh.castShadow = kind !== 'glow';
  mesh.receiveShadow = false;
  return mesh;
}

/** Dispose everything under an object except shared materials. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
    for (const m of mats) {
      if (m.userData?.shared) continue;
      for (const v of Object.values(m)) if (v instanceof THREE.Texture && !v.userData?.shared) v.dispose();
      m.dispose();
    }
  });
}

// Common geometries (factories, since parts get transformed in place)
export const G = {
  box: (w = 1, h = 1, d = 1) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt = 0.5, rb = 0.5, h = 1, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg),
  cone: (r = 0.5, h = 1, seg = 8) => new THREE.ConeGeometry(r, h, seg),
  sphere: (r = 0.5, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h),
  ico: (r = 0.5, detail = 0) => new THREE.IcosahedronGeometry(r, detail),
  dodeca: (r = 0.5) => new THREE.DodecahedronGeometry(r, 0),
  torus: (r = 0.5, t = 0.1, rs = 6, ts = 12, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc),
  plane: (w = 1, h = 1) => new THREE.PlaneGeometry(w, h),
  lathe: (pts: [number, number][], seg = 10) =>
    new THREE.LatheGeometry(
      pts.map(([r, y]) => new THREE.Vector2(r, y)),
      seg,
    ),
};
