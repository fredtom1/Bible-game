import * as THREE from 'three';
import type { Stage } from '../world/Stage';
import { Builder, G, roughen } from '../world/geo';
import { oliveTree, cypress } from '../world/props';
import { makeLabel } from '../world/Character';
import { softTexture, ParticleField } from '../world/Particles';
import { makeWaterMaterial } from '../world/Water';
import { ERAS } from './catalog';
import { ERA_ORDER, eraProgress, isEraUnlocked, type EraId, type SaveData } from '../logic/progress';
import { SCALES, type MusicTheme } from '../engine/Audio';
import type { NPC } from '../world/actors';

export const HUB_MUSIC: MusicTheme = { root: 62, scale: SCALES.dorian, bpm: 68, instrument: 'harp', drone: 0.8, drums: 'none', density: 0.33 };

const R_ISLAND = 30;
const R_GATES = 21;

export interface Gate {
  id: EraId;
  pos: THREE.Vector3;
  front: THREE.Vector3;
  mat: THREE.ShaderMaterial;
  label: THREE.Sprite;
  group: THREE.Group;
}

export interface Hub {
  gates: Gate[];
  selah: NPC;
  spawn: THREE.Vector3;
  mirrorPos: THREE.Vector3;
  vaultPos: THREE.Vector3;
  refresh(save: SaveData): void;
}

export function gateAngle(i: number): number {
  const step = Math.PI / 5.4;
  return Math.PI - (i - 3) * step;
}

function portalMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, color: { value: new THREE.Color(color) }, uActive: { value: 1 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
    fragmentShader: /* glsl */ `
      uniform float time; uniform vec3 color; uniform float uActive; varying vec2 vUv;
      void main(){
        vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
        float a = atan(p.y, p.x);
        float sw = sin(a * 5.0 + r * 14.0 - time * 3.0) * 0.5 + 0.5;
        float sw2 = sin(a * 3.0 - r * 9.0 + time * 2.0) * 0.5 + 0.5;
        vec3 c = mix(color * 0.35, color * 1.4 + 0.25, sw * (1.0 - r * 0.6));
        c += vec3(1.0, 0.95, 0.85) * pow(1.0 - r, 4.0) * 1.2 + sw2 * 0.08;
        vec3 locked = vec3(0.18, 0.16, 0.22) + sw2 * 0.04;
        float alpha = smoothstep(1.0, 0.9, r) * mix(0.85, 0.92, uActive);
        gl_FragColor = vec4(mix(locked, c, uActive), alpha);
        #include <colorspace_fragment>
      }`,
  });
}

export function buildHub(
  stage: Stage,
  save: SaveData,
  handlers: { onGate: (id: EraId) => void; onVault: () => void; onMirror: () => void },
): Hub {
  const rng = stage.rng;
  stage.heightFn = (x, z) => (Math.hypot(x, z) < R_ISLAND - 0.5 ? 0 : -80);
  stage.circleBounds = { x: 0, z: 0, r: R_ISLAND - 1.2 };
  const b = stage.statics;

  // Island
  b.add(G.cyl(R_ISLAND, R_ISLAND - 3, 3, 56), '#eadfcf', { y: -1.5, jitter: 0.03 });
  b.add(roughen(G.cone(R_ISLAND - 3, 34, 18), 1.6, rng), '#8a7766', { y: -20, rx: Math.PI, jitter: 0.1 });
  for (const [r, c] of [
    [6, '#e8c46a'],
    [13, '#d9b65e'],
    [26, '#e8c46a'],
  ] as const) {
    b.add(new THREE.RingGeometry(r - 0.18, r, 64), c, { kind: 'metal', y: 0.02, rx: -Math.PI / 2 });
  }
  // mosaic star in the centre
  for (let i = 0; i < 8; i++) {
    b.add(G.box(0.5, 0.04, 5), i % 2 ? '#c9a24a' : '#7a5cff', { y: 0.02, ry: (i / 8) * Math.PI });
  }
  // balustrade
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    b.add(G.cyl(0.14, 0.18, 1.1, 6), '#f3ead8', { x: Math.sin(a) * (R_ISLAND - 0.6), y: 0.55, z: Math.cos(a) * (R_ISLAND - 0.6) });
  }
  b.add(G.torus(R_ISLAND - 0.6, 0.12, 4, 96), '#f7efdf', { y: 1.15, rx: Math.PI / 2 });

  // Centre pedestal with the scroll
  b.add(G.cyl(1.4, 1.8, 0.5, 12), '#f3ead8', { y: 0.25 });
  b.add(G.cyl(0.5, 0.7, 1.4, 10), '#efe4d0', { y: 1.2 });
  b.add(G.cyl(1.0, 0.8, 0.25, 12), '#e8c46a', { kind: 'metal', y: 2.0 });
  const scroll = new Builder();
  scroll.add(G.cyl(0.22, 0.22, 1.4, 12), '#f6ecd0', { rz: Math.PI / 2 });
  scroll.add(G.cyl(0.28, 0.28, 0.1, 12), '#8a5a2a', { rz: Math.PI / 2, x: 0.75 });
  scroll.add(G.cyl(0.28, 0.28, 0.1, 12), '#8a5a2a', { rz: Math.PI / 2, x: -0.75 });
  scroll.add(G.box(1.2, 0.02, 0.9), '#f6ecd0', { kind: 'cloth', y: -0.3, z: 0.3, rx: 0.6 });
  const scrollObj = scroll.build({ shadows: false });
  scrollObj.position.set(0, 3.1, 0);
  stage.scene.add(scrollObj);
  stage.addCircle(0, 0, 1.9);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(), color: '#ffe2a0', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  glow.scale.set(5, 5, 1);
  glow.position.set(0, 3.1, 0);
  stage.scene.add(glow);

  // Planters with trees
  for (const [x, z] of [
    [-16, 14],
    [16, 14],
    [-24, 4],
    [24, 4],
  ]) {
    b.add(G.cyl(1.5, 1.3, 0.8, 10), '#d9cbb3', { x, y: 0.4, z });
    oliveTree(b, { x, y: 0.8, z, s: 0.9 }, rng);
    stage.addCircle(x, z, 1.6);
  }

  // Mirror pool (change appearance)
  const mirrorPos = new THREE.Vector3(11, 0, 9);
  b.add(G.cyl(3.4, 3.6, 0.45, 24), '#efe4d0', { x: mirrorPos.x, y: 0.22, z: mirrorPos.z });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(3, 32).rotateX(-Math.PI / 2), makeWaterMaterial({ deep: '#3a2a6a', shallow: '#9fd8ff', amp: 0.02, foam: 0.1 }));
  pool.position.set(mirrorPos.x, 0.47, mirrorPos.z);
  stage.scene.add(pool);
  stage.waters.push(pool.material as THREE.ShaderMaterial);
  stage.addCircle(mirrorPos.x, mirrorPos.z, 3.2);
  const mirrorLabel = makeLabel('Reflecting Pool', { sub: 'Change your look', size: 0.32 });
  mirrorLabel.position.set(mirrorPos.x, 2.4, mirrorPos.z);
  stage.scene.add(mirrorLabel);

  // Verse Vault lectern
  const vaultPos = new THREE.Vector3(-11, 0, 9);
  b.at({ x: vaultPos.x, y: 0, z: vaultPos.z, ry: 0.6 }, () => {
    b.add(G.cyl(0.6, 0.8, 0.3, 8), '#efe4d0', { y: 0.15 });
    b.add(G.cyl(0.18, 0.25, 1.1, 8), '#c9a24a', { kind: 'metal', y: 0.85 });
    b.add(G.box(1.2, 0.08, 0.8), '#6a3a2a', { y: 1.45, rx: -0.4 });
    b.add(G.box(0.55, 0.04, 0.75), '#f6ecd0', { x: -0.29, y: 1.51, rx: -0.4, rz: 0.08 });
    b.add(G.box(0.55, 0.04, 0.75), '#f6ecd0', { x: 0.29, y: 1.51, rx: -0.4, rz: -0.08 });
  });
  stage.addCircle(vaultPos.x, vaultPos.z, 0.9);
  const vaultLabel = makeLabel('Verse Vault', { sub: 'Practise your verses', size: 0.32 });
  vaultLabel.position.set(vaultPos.x, 2.6, vaultPos.z);
  stage.scene.add(vaultLabel);
  stage.addFlame(vaultPos.x, 1.9, vaultPos.z, 0.9, false, '#ffe39a');

  // Gates
  const gates: Gate[] = [];
  ERAS.forEach((meta, i) => {
    const a = gateAngle(i);
    const pos = new THREE.Vector3(Math.sin(a) * R_GATES, 0, Math.cos(a) * R_GATES);
    const front = pos.clone().multiplyScalar(-1).normalize();
    const g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.y = a + Math.PI;
    const gb = new Builder(rng);
    for (const sx of [-1, 1]) {
      gb.add(G.cyl(0.42, 0.52, 5.2, 10), '#f3ead8', { x: sx * 2.6, y: 2.6 });
      gb.add(G.box(1.2, 0.5, 1.2), '#e2d4bc', { x: sx * 2.6, y: 0.25 });
      gb.add(G.box(1.1, 0.35, 1.1), meta.accent, { x: sx * 2.6, y: 5.35 });
    }
    gb.add(G.torus(2.6, 0.35, 8, 24, Math.PI), '#f3ead8', { y: 5.2 });
    gb.add(G.torus(2.6, 0.12, 6, 24, Math.PI), meta.accent, { kind: 'metal', y: 5.2, z: 0.3 });
    gb.add(G.box(5.8, 0.3, 2.2), '#e2d4bc', { y: 0.15 });
    g.add(gb.build());
    const mat = portalMaterial(meta.accent);
    const portal = new THREE.Mesh(new THREE.CircleGeometry(2.3, 40), mat);
    portal.position.y = 3.6;
    portal.scale.set(1, 1.45, 1);
    g.add(portal);
    const label = makeLabel(meta.title, { sub: meta.ref, size: 0.8 });
    label.position.set(0, 8.8, 0);
    g.add(label);
    stage.scene.add(g);
    for (const sx of [-1, 1]) {
      const p = new THREE.Vector3(sx * 2.6, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), a + Math.PI).add(pos);
      stage.addCircle(p.x, p.z, 0.7);
    }
    // stepping path toward the centre
    for (let k = 1; k <= 4; k++) {
      const pp = pos.clone().addScaledVector(front, k * 2.6);
      b.add(G.cyl(0.8, 0.8, 0.06, 8), k % 2 ? meta.accent : '#e8dcc8', { x: pp.x, y: 0.03, z: pp.z });
    }
    gates.push({ id: meta.id, pos, front, mat, label, group: g });
    stage.interactable(
      () => pos.clone().addScaledVector(front, 1.2),
      `Enter: ${meta.title}`,
      () => handlers.onGate(meta.id),
      3.6,
    );
  });

  stage.interactable(mirrorPos, 'Look into the pool', () => handlers.onMirror(), 4.2);
  stage.interactable(vaultPos, 'Open the Verse Vault', () => handlers.onVault(), 2.8);

  // Clouds below and around
  for (let i = 0; i < 46; i++) {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: softTexture(), color: i % 3 ? '#ffe9e0' : '#f6c6c9', transparent: true, opacity: 0.55, depthWrite: false, fog: true }),
    );
    const a = rng() * Math.PI * 2;
    const r = 45 + rng() * 220;
    s.position.set(Math.sin(a) * r, -22 - rng() * 30 + (r > 150 ? 20 : 0), Math.cos(a) * r);
    const sc = 40 + rng() * 70;
    s.scale.set(sc, sc * 0.45, 1);
    stage.scene.add(s);
  }
  // floating rock islets
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const r = 48 + rng() * 40;
    const ib = new Builder(rng);
    ib.add(G.cyl(3, 2.4, 1, 10), '#e5d8c3', { jitter: 0.04 });
    ib.add(roughen(G.cone(2.4, 7, 9), 0.5, rng), '#b39a86', { y: -4, rx: Math.PI });
    if (i % 2) cypress(ib, { x: 0, y: 0.5, z: 0, s: 0.7 }, rng);
    const islet = ib.build();
    islet.position.set(Math.sin(a) * r, -14 + rng() * 8, Math.cos(a) * r);
    stage.scene.add(islet);
    const baseY = islet.position.y;
    const ph = rng() * 6;
    stage.onUpdate((_, t) => {
      islet.position.y = baseY + Math.sin(t * 0.4 + ph) * 0.8;
    });
  }
  // drifting golden motes
  stage.addField(goldenMotes(stage));

  stage.bake();

  // Selah, keeper of the scrolls
  const selah = stage.addNPC(
    'Selah',
    {
      skin: '#8d5a3b',
      robe: '#26306b',
      robe2: '#2c3a80',
      sash: '#f3c86a',
      hair: 'long',
      hairColor: '#2a1a12',
      headwear: 'hood',
      headwearColor: '#1d2452',
      item: 'scroll',
    },
    0,
    4.2,
    0,
    '#3b4aa0',
  );

  stage.onUpdate((dt, t) => {
    scrollObj.rotation.y += dt * 0.4;
    scrollObj.position.y = 3.1 + Math.sin(t * 1.3) * 0.15;
    for (const g of gates) g.mat.uniforms.time.value = t;
  });

  const hub: Hub = {
    gates,
    selah,
    spawn: new THREE.Vector3(0, 0, 15),
    mirrorPos,
    vaultPos,
    refresh(s: SaveData) {
      for (const g of gates) {
        const open = isEraUnlocked(s, g.id);
        const p = eraProgress(s, g.id);
        g.mat.uniforms.uActive.value = open ? 1 : 0;
        const meta = ERAS[ERA_ORDER.indexOf(g.id)];
        const sub = !open ? '🔒 Locked' : p.completed ? `${'★'.repeat(p.bestStars)}${'☆'.repeat(3 - p.bestStars)}` : meta.ref;
        const old = g.label;
        const label = makeLabel(meta.title, { sub, size: 0.8 });
        label.position.copy(old.position);
        g.group.remove(old);
        old.material.map?.dispose();
        old.material.dispose();
        g.group.add(label);
        g.label = label;
      }
    },
  };
  hub.refresh(save);
  return hub;
}

/** Golden motes drifting over the island. */
function goldenMotes(stage: Stage): ParticleField {
  return new ParticleField({
    count: Math.round(160 * stage.svc.quality.particles),
    color: '#ffd98a',
    size: 0.16,
    spawn: (p, v) => {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 28;
      p.set(Math.sin(a) * r, Math.random() * 6, Math.cos(a) * r);
      v.set((Math.random() - 0.5) * 0.3, 0.2 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3);
      return 4 + Math.random() * 5;
    },
  });
}
