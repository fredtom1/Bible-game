import * as THREE from 'three';
import { Builder, G, roughen } from './geo';
import { rand, type Rng } from '../engine/noise';

export interface At {
  x: number;
  y: number;
  z: number;
  ry?: number;
  s?: number;
}

const at = (o: At) => ({ x: o.x, y: o.y, z: o.z, ry: o.ry ?? 0, s: o.s ?? 1 });

export function palmTree(b: Builder, o: At, rng: Rng): void {
  b.at(at(o), () => {
    const h = rand(rng, 4.5, 7.5);
    const lean = rand(rng, -0.25, 0.25);
    const segs = 6;
    let x = 0;
    let y = 0;
    for (let i = 0; i < segs; i++) {
      const sh = h / segs;
      const r = 0.2 - i * 0.015;
      b.add(G.cyl(r * 0.92, r, sh, 7), i % 2 ? '#8a6a45' : '#7b5c3a', { x, y: y + sh / 2, rz: lean * (i / segs) * 0.6 });
      x += Math.sin(lean * (i / segs)) * sh * 0.6;
      y += sh * 0.98;
    }
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng();
      const droop = rand(rng, 0.25, 0.6);
      b.add(G.cone(0.38, 2.6, 4), i % 2 ? '#3f8a3a' : '#4c9b40', {
        kind: 'cloth',
        x: x + Math.sin(a) * 1.1,
        y: y - 0.2,
        z: Math.cos(a) * 1.1,
        rx: Math.PI / 2 + droop,
        ry: a,
        sz: 0.18,
        rz: 0,
      });
    }
    b.add(G.sphere(0.32, 6, 5), '#6b4a2a', { x, y: y - 0.05 });
  });
}

export function oliveTree(b: Builder, o: At, rng: Rng): void {
  b.at(at(o), () => {
    b.add(G.cyl(0.18, 0.32, 1.6, 6), '#6b5a48', { y: 0.8, rz: rand(rng, -0.2, 0.2) });
    b.add(G.cyl(0.1, 0.16, 1.1, 5), '#6b5a48', { x: 0.3, y: 1.7, rz: -0.6 });
    b.add(G.cyl(0.1, 0.16, 1.0, 5), '#6b5a48', { x: -0.3, y: 1.6, rz: 0.6 });
    for (let i = 0; i < 6; i++) {
      b.add(roughen(G.ico(rand(rng, 0.7, 1.1), 0), 0.15, rng), i % 2 ? '#7c8f5a' : '#8b9b66', {
        x: rand(rng, -1.1, 1.1),
        y: rand(rng, 2.0, 2.8),
        z: rand(rng, -1.1, 1.1),
      });
    }
  });
}

export function leafyTree(b: Builder, o: At, rng: Rng, color = '#4f8f3a'): void {
  b.at(at(o), () => {
    const h = rand(rng, 2.2, 3.4);
    b.add(G.cyl(0.18, 0.28, h, 6), '#6a4c32', { y: h / 2 });
    for (let i = 0; i < 4; i++) {
      b.add(roughen(G.ico(rand(rng, 1.0, 1.6), 0), 0.2, rng), color, {
        x: rand(rng, -0.8, 0.8),
        y: h + rand(rng, 0.2, 1.4),
        z: rand(rng, -0.8, 0.8),
        jitter: 0.12,
      });
    }
  });
}

export function cypress(b: Builder, o: At, rng: Rng): void {
  b.at(at(o), () => {
    const h = rand(rng, 4, 6.5);
    b.add(G.cyl(0.12, 0.16, 0.8, 5), '#5a4030', { y: 0.4 });
    b.add(roughen(G.cone(0.9, h, 7), 0.12, rng), '#2f5a33', { y: 0.6 + h / 2, jitter: 0.1 });
  });
}

export function rock(b: Builder, o: At, rng: Rng, color = '#9a8f80'): void {
  b.at(at(o), () => {
    b.add(roughen(G.dodeca(1), 0.35, rng), color, {
      y: 0.3,
      sx: rand(rng, 0.8, 1.4),
      sy: rand(rng, 0.5, 0.9),
      sz: rand(rng, 0.8, 1.3),
      ry: rng() * 6,
      jitter: 0.1,
    });
  });
}

export function bush(b: Builder, o: At, rng: Rng, color = '#5d8a3e'): void {
  b.at(at(o), () => {
    for (let i = 0; i < 3; i++) {
      b.add(roughen(G.ico(rand(rng, 0.35, 0.6), 0), 0.12, rng), color, {
        x: rand(rng, -0.4, 0.4),
        y: 0.3,
        z: rand(rng, -0.4, 0.4),
        jitter: 0.12,
      });
    }
  });
}

/** Scatter grass tufts using a placement predicate. */
export function grass(
  b: Builder,
  count: number,
  area: { x0: number; x1: number; z0: number; z1: number },
  ground: (x: number, z: number) => number,
  ok: (x: number, z: number) => boolean,
  rng: Rng,
  colors = ['#6aa84f', '#7cb85a', '#5c9a44'],
): void {
  for (let i = 0; i < count; i++) {
    const x = rand(rng, area.x0, area.x1);
    const z = rand(rng, area.z0, area.z1);
    if (!ok(x, z)) continue;
    const y = ground(x, z);
    const c = colors[i % colors.length];
    for (let k = 0; k < 3; k++) {
      b.add(G.cone(0.07, rand(rng, 0.35, 0.6), 3), c, {
        kind: 'cloth',
        x: x + rand(rng, -0.12, 0.12),
        y: y + 0.18,
        z: z + rand(rng, -0.12, 0.12),
        rx: rand(rng, -0.3, 0.3),
        rz: rand(rng, -0.3, 0.3),
      });
    }
  }
}

export function flowers(
  b: Builder,
  count: number,
  area: { x0: number; x1: number; z0: number; z1: number },
  ground: (x: number, z: number) => number,
  ok: (x: number, z: number) => boolean,
  rng: Rng,
  colors = ['#f3d34a', '#e86a8a', '#ffffff', '#b07ad8'],
): void {
  for (let i = 0; i < count; i++) {
    const x = rand(rng, area.x0, area.x1);
    const z = rand(rng, area.z0, area.z1);
    if (!ok(x, z)) continue;
    b.add(G.sphere(0.07, 5, 4), colors[i % colors.length], { x, y: ground(x, z) + 0.12, z, jitter: 0 });
  }
}

/** Goat-hair A-frame tent with an open front and a rug. */
export function tent(b: Builder, o: At, color = '#4a3a30', stripe = '#d8c8a8'): void {
  b.at(at(o), () => {
    const half = 1.8;
    const ridge = 2.3;
    const slope = Math.atan2(ridge - 0.25, half);
    const len = Math.hypot(half, ridge - 0.25);
    for (const s of [1, -1]) {
      b.add(G.box(4, 0.07, len), color, { kind: 'cloth', y: 0.25 + (ridge - 0.25) / 2, z: (s * half) / 2, rx: s * slope });
      b.add(G.box(4.02, 0.08, 0.22), stripe, { kind: 'cloth', y: 0.25 + (ridge - 0.25) * 0.3, z: s * half * 0.72, rx: s * slope });
    }
    const tri = new THREE.Shape();
    tri.moveTo(-half, 0);
    tri.lineTo(half, 0);
    tri.lineTo(0, ridge);
    tri.closePath();
    const back = new THREE.ExtrudeGeometry(tri, { depth: 0.06, bevelEnabled: false });
    b.add(back, color, { kind: 'cloth', x: -2, ry: Math.PI / 2 });
    b.add(G.cyl(0.05, 0.05, ridge + 0.3, 5), '#6a4a2a', { x: 2, y: (ridge + 0.3) / 2 });
    b.add(G.cyl(0.05, 0.05, ridge + 0.3, 5), '#6a4a2a', { x: -2, y: (ridge + 0.3) / 2 });
    b.add(G.cyl(0.04, 0.04, 4.2, 5), '#6a4a2a', { y: ridge, rz: Math.PI / 2 });
    b.add(G.box(1.6, 0.04, 2), '#9a3a2a', { x: 0.8, y: 0.03 });
    b.add(G.box(1.5, 0.05, 1.8), '#c9a24a', { x: 0.8, y: 0.035, sx: 0.6, sz: 0.6 });
  });
}

/** Mud-brick house with flat roof, parapet, door and windows. */
export function house(
  b: Builder,
  o: At,
  w = 5,
  d = 5,
  h = 3,
  color = '#c9a578',
  opts: { door?: boolean; windows?: boolean; stairs?: boolean } = {},
): void {
  b.at(at(o), () => {
    b.add(G.box(w, h, d), color, { y: h / 2, jitter: 0.04 });
    b.add(G.box(w + 0.2, 0.18, d + 0.2), '#a8865c', { y: h + 0.09 });
    for (const [px, pz, pw, pd] of [
      [0, d / 2 + 0.05, w + 0.2, 0.2],
      [0, -d / 2 - 0.05, w + 0.2, 0.2],
      [w / 2 + 0.05, 0, 0.2, d],
      [-w / 2 - 0.05, 0, 0.2, d],
    ]) {
      b.add(G.box(pw, 0.45, pd), color, { x: px, y: h + 0.4, z: pz });
    }
    for (let i = -w / 2 + 0.6; i < w / 2; i += 0.9) {
      b.add(G.cyl(0.07, 0.07, 0.5, 5), '#6a4a2a', { x: i, y: h - 0.25, z: d / 2 + 0.2, rx: Math.PI / 2 });
    }
    if (opts.door !== false) b.add(G.box(1.0, 1.9, 0.12), '#4a3020', { y: 0.95, z: d / 2 + 0.01 });
    if (opts.windows !== false) {
      b.add(G.box(0.6, 0.6, 0.1), '#2a1c14', { x: w / 2 - 1, y: h * 0.62, z: d / 2 + 0.01 });
      b.add(G.box(0.1, 0.6, 0.6), '#2a1c14', { x: w / 2 + 0.01, y: h * 0.62, z: 0 });
    }
    if (opts.stairs) {
      for (let i = 0; i < 6; i++) {
        b.add(G.box(0.9, 0.5, 0.5), color, { x: -w / 2 - 0.5, y: 0.25 + i * 0.5 * 0.5, z: -d / 2 + 0.5 + i * 0.5, sy: 1 + i });
      }
    }
  });
}

/** Straight wall segment between two points; optional crenellations. */
export function wall(
  b: Builder,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  y: number,
  h: number,
  thick: number,
  color: string,
  crenel = true,
): void {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const ry = Math.atan2(x2 - x1, z2 - z1);
  b.at({ x: (x1 + x2) / 2, y, z: (z1 + z2) / 2, ry }, () => {
    b.add(G.box(thick, h, len), color, { y: h / 2, jitter: 0.05 });
    if (crenel) {
      const n = Math.floor(len / 1.2);
      for (let i = 0; i < n; i++) {
        b.add(G.box(thick + 0.1, 0.6, 0.6), color, { y: h + 0.3, z: -len / 2 + 0.6 + i * 1.2 });
      }
    }
  });
}

export function tower(b: Builder, o: At, r = 2, h = 9, color = '#b89a72'): void {
  b.at(at(o), () => {
    b.add(G.cyl(r, r * 1.1, h, 10), color, { y: h / 2, jitter: 0.05 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      b.add(G.box(0.6, 0.7, 0.6), color, { x: Math.sin(a) * r, z: Math.cos(a) * r, y: h + 0.35, ry: a });
    }
  });
}

export function campfire(b: Builder, o: At): void {
  b.at(at(o), () => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.add(G.cyl(0.07, 0.08, 0.9, 5), '#5a3a22', { x: Math.sin(a) * 0.2, y: 0.12, z: Math.cos(a) * 0.2, rz: Math.PI / 2.3, ry: a });
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.add(G.dodeca(0.16), '#7a7068', { x: Math.sin(a) * 0.6, y: 0.08, z: Math.cos(a) * 0.6 });
    }
  });
}

export function jar(b: Builder, o: At, color = '#b5653a'): void {
  b.at(at(o), () => {
    b.add(G.lathe([[0.0, 0], [0.18, 0.02], [0.26, 0.3], [0.2, 0.55], [0.1, 0.62], [0.12, 0.7], [0.0, 0.7]], 8), color, {});
  });
}

export function crate(b: Builder, o: At): void {
  b.at(at(o), () => b.add(G.box(0.8, 0.6, 0.8), '#8a6a42', { y: 0.3 }));
}

export function stall(b: Builder, o: At, cloth = '#c0462e', rng: Rng = Math.random): void {
  b.at(at(o), () => {
    for (const [x, z] of [
      [-1.2, -0.8],
      [1.2, -0.8],
      [-1.2, 0.8],
      [1.2, 0.8],
    ]) {
      b.add(G.cyl(0.05, 0.05, 2.3, 5), '#6a4a2a', { x, y: 1.15, z });
    }
    b.add(G.box(2.7, 0.05, 2.0), cloth, { kind: 'cloth', y: 2.3, rx: 0.12 });
    b.add(G.box(2.3, 0.8, 1.0), '#8a6a42', { y: 0.4, z: 0.3 });
    for (let i = 0; i < 5; i++) {
      b.add(G.sphere(0.12, 6, 4), ['#e2a03a', '#7aa83a', '#c84a3a', '#e8d27a'][i % 4], {
        x: -0.8 + i * 0.4,
        y: 0.9,
        z: 0.3 + rand(rng, -0.2, 0.2),
      });
    }
  });
}

export function well(b: Builder, o: At): void {
  b.at(at(o), () => {
    b.add(G.cyl(1.0, 1.1, 0.9, 12), '#9a8f80', { y: 0.45 });
    b.add(G.cyl(0.8, 0.8, 0.92, 12), '#2a3a48', { y: 0.46 });
    b.add(G.cyl(0.06, 0.06, 2, 5), '#5a4030', { x: 0.9, y: 1.4 });
    b.add(G.cyl(0.06, 0.06, 2, 5), '#5a4030', { x: -0.9, y: 1.4 });
    b.add(G.cyl(0.06, 0.06, 2, 5), '#5a4030', { y: 2.3, rz: Math.PI / 2 });
  });
}

export function boat(b: Builder, o: At, color = '#7a5332'): void {
  b.at(at(o), () => {
    b.add(G.box(1.6, 0.6, 5), color, { y: 0.3 });
    b.add(G.cone(0.8, 1.4, 4), color, { y: 0.3, z: 3.1, rx: Math.PI / 2, ry: Math.PI / 4, sx: 1.4, sz: 0.55 });
    b.add(G.box(1.4, 0.1, 4.8), '#5a3a22', { y: 0.62 });
    b.add(G.cyl(0.06, 0.07, 4.5, 5), '#5a3a22', { y: 2.6, z: 0.6 });
    b.add(G.box(0.04, 3, 2.2), '#efe6d2', { kind: 'cloth', y: 2.8, z: 0.6 });
  });
}

export function reeds(b: Builder, o: At, rng: Rng): void {
  b.at(at(o), () => {
    for (let i = 0; i < 9; i++) {
      const h = rand(rng, 1, 1.9);
      b.add(G.cyl(0.02, 0.03, h, 3), i % 3 ? '#7a8f4a' : '#9aa85a', {
        x: rand(rng, -0.5, 0.5),
        y: h / 2,
        z: rand(rng, -0.5, 0.5),
        rx: rand(rng, -0.15, 0.15),
        rz: rand(rng, -0.15, 0.15),
      });
    }
  });
}

/** Stepped temple-tower (ziggurat) for the Babylon skyline. */
export function ziggurat(b: Builder, o: At): void {
  b.at(at(o), () => {
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const s = 30 - i * 5.5;
      b.add(G.box(s, 5, s), i % 2 ? '#b88d5a' : '#c79c66', { y: 2.5 + i * 5 });
    }
    b.add(G.box(5, 5, 5), '#2f5aa8', { y: 2.5 + tiers * 5 });
    b.add(G.box(3, 30, 2), '#a8804e', { y: 13, z: 16, rx: -0.55 });
  });
}

/** Simple ladder/stair run along +Z. */
export function stairs(b: Builder, o: At, steps: number, color: string, w = 2): void {
  b.at(at(o), () => {
    for (let i = 0; i < steps; i++) b.add(G.box(w, 0.25 * (i + 1), 0.4), color, { y: 0.125 * (i + 1), z: i * 0.4 });
  });
}

export function makeRainbow(radius = 120): THREE.Mesh {
  const geo = new THREE.TorusGeometry(radius, radius * 0.06, 8, 64, Math.PI);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: { opacity: { value: 0 } },
    vertexShader: /* glsl */ `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
    fragmentShader: /* glsl */ `uniform float opacity; varying vec3 vP;
      vec3 hsv(float h){ vec3 k = vec3(1.0, 2.0/3.0, 1.0/3.0); vec3 p = abs(fract(vec3(h)+k)*6.0-3.0); return clamp(p-1.0,0.0,1.0);}
      void main(){ float r = length(vP.xy); float t = (r - ${(radius * 0.94).toFixed(1)}) / ${(radius * 0.12).toFixed(1)};
        vec3 c = hsv(clamp(1.0 - t, 0.0, 1.0) * 0.8);
        float edge = smoothstep(0.0, 0.15, t) * smoothstep(1.0, 0.85, t);
        gl_FragColor = vec4(c, edge * opacity * 0.55); }`,
  });
  const m = new THREE.Mesh(geo, mat);
  return m;
}
