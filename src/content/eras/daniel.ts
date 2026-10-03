import * as THREE from 'three';
import type { EraModule } from '../eraTypes';
import type { Stage } from '../../world/Stage';
import { Builder, G } from '../../world/geo';
import { Noise2D, rand } from '../../engine/noise';
import { SCALES } from '../../engine/Audio';
import { Ease } from '../../engine/tasks';
import { palmTree, house, ziggurat, stall, jar, cypress } from '../../world/props';
import { lerpColor } from '../../world/Terrain';
import { ParticleField } from '../../world/Particles';
import { Crowd } from '../../world/Crowd';
import { ERA_BY_ID } from '../catalog';
import type { NPC } from '../../world/actors';
import type { Animal } from '../../world/Animal';
import type { Look } from '../../world/Character';

const META = ERA_BY_ID.daniel;
const GARDEN = { x0: -64, x1: -20, z0: -48, z1: -14 };
const GAZEBO = new THREE.Vector3(-42, 0, -38);
const ENTRY = new THREE.Vector3(-19, 0, -16);
const HOUSE = { x: 34, z: 8 };
const DEN = { x: 36, z: 52 };

let daniel: NPC, darius: NPC, scribe: NPC, servant: NPC;
let officials: NPC[] = [];
let guards: { npc: NPC; cone: THREE.Mesh; path: [number, number][]; idx: number; wait: number }[] = [];
let hedges: { x0: number; x1: number; z0: number; z1: number }[] = [];
let lions: Animal[] = [];
let denStone: THREE.Group;
let crowd: Crowd;

const LOOKS: Record<string, Look> = {
  daniel: { skin: '#9c6a45', robe: '#3f4f8a', robe2: '#c9a24a', sash: '#c9a24a', hair: 'short', hairColor: '#e8e4dc', beard: 'long', beardColor: '#efece6', headwear: 'headwrap', headwearColor: '#efe6d2' },
  darius: { skin: '#b07650', robe: '#6a2a6a', robe2: '#c9a24a', sash: '#e6b93a', hair: 'long', hairColor: '#1a120c', beard: 'long', beardColor: '#1a120c', headwear: 'crown', height: 1.06 },
  official: { skin: '#b07650', robe: '#7a2a2a', robe2: '#a8402e', sash: '#e0c080', hair: 'short', beard: 'long', beardColor: '#1a120c', headwear: 'keffiyeh', headwearColor: '#3a3a6a' },
  guard: { skin: '#9c6a45', robe: '#2a3a6a', sash: '#c9a24a', hair: 'short', beard: 'short', headwear: 'helmet', armor: true, item: 'spear' },
  scribe: { skin: '#8d5a3b', robe: '#c9b48a', sash: '#2a4a8a', hair: 'short', headwear: 'headwrap', headwearColor: '#e8dcc0', item: 'scroll' },
  servant: { skin: '#9c6a45', robe: '#8a7a6a', sash: '#5a4030', hair: 'short', headwear: 'headwrap', headwearColor: '#d8c8a8' },
};

/** Segment–AABB intersection in 2D (slab method). */
function blocked(ax: number, az: number, bx: number, bz: number): boolean {
  for (const h of hedges) {
    let t0 = 0;
    let t1 = 1;
    const dx = bx - ax;
    const dz = bz - az;
    let hit = true;
    for (const [p, d, lo, hi] of [
      [ax, dx, h.x0, h.x1],
      [az, dz, h.z0, h.z1],
    ]) {
      if (Math.abs(d) < 1e-6) {
        if (p < lo || p > hi) hit = false;
      } else {
        let ta = (lo - p) / d;
        let tb = (hi - p) / d;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) hit = false;
      }
    }
    if (hit) return true;
  }
  return false;
}

function blueWall(b: Builder, x: number, z: number, w: number, d: number, hgt: number, ry = 0): void {
  b.at({ x, y: 0, z, ry }, () => {
    b.add(G.box(w, hgt, d), '#2a52a8', { y: hgt / 2, jitter: 0.04 });
    b.add(G.box(w + 0.1, 0.5, d + 0.1), '#e8c46a', { kind: 'metal', y: hgt - 0.6 });
    b.add(G.box(w + 0.1, 0.3, d + 0.1), '#e8c46a', { kind: 'metal', y: 1 });
    const n = Math.floor(w / 4);
    for (let i = 0; i < n; i++) {
      // golden lion / dragon reliefs (stylised)
      b.add(G.box(2, 1.1, 0.12), i % 2 ? '#f0c84a' : '#e6dcc0', { kind: 'metal', x: -w / 2 + 2 + i * 4, y: hgt * 0.55, z: d / 2 + 0.02 });
      b.add(G.box(0.4, 0.5, 0.12), i % 2 ? '#f0c84a' : '#e6dcc0', { kind: 'metal', x: -w / 2 + 3.1 + i * 4, y: hgt * 0.55 + 0.6, z: d / 2 + 0.02 });
    }
    for (let i = 0; i < Math.floor(w / 1.6); i++) b.add(G.box(0.9, 0.9, d + 0.2), '#2a52a8', { x: -w / 2 + 0.8 + i * 1.6, y: hgt + 0.45 });
  });
}

function setup(stage: Stage): void {
  officials = [];
  guards = [];
  hedges = [];
  lions = [];
  const noise = new Noise2D(61);
  const rng = stage.rng;
  const ground = (x: number, z: number) => {
    if (Math.hypot(x - DEN.x, z - DEN.z) < 6) return -4;
    return noise.fbm(x * 0.01, z * 0.01, 2) * 0.25;
  };
  stage.heightFn = ground;
  stage.terrain({
    size: 320,
    segments: 120,
    height: ground,
    color: (x, z) => {
      if (Math.abs(x) < 6 && z > -60) return lerpColor('#c9b08a', '#d8c09a', ((Math.floor(x * 0.5) + Math.floor(z * 0.5)) & 1) * 0.6);
      if (x > GARDEN.x0 && x < GARDEN.x1 && z > GARDEN.z0 && z < GARDEN.z1) return lerpColor('#4f7a35', '#6a9a45', noise.get(x * 0.2, z * 0.2) * 0.5 + 0.5);
      if (Math.hypot(x - DEN.x, z - DEN.z) < 6.5) return '#5a4a3a';
      return lerpColor('#c2a074', '#b08a62', noise.get(x * 0.05, z * 0.05) * 0.5 + 0.5);
    },
  });
  stage.bounds = { x0: -72, x1: 72, z0: -66, z1: 72 };
  const b = stage.statics;

  // Palace with blue glazed walls
  blueWall(b, 0, -62, 70, 4, 14);
  blueWall(b, -36, -52, 4, 24, 12, Math.PI / 2);
  blueWall(b, 36, -52, 4, 24, 12, Math.PI / 2);
  stage.addBox(0, -62, 70, 4);
  // gate towers
  for (const sx of [-6, 6]) {
    b.add(G.box(5, 18, 6), '#2a52a8', { x: sx, y: 9, z: -58 });
    b.add(G.box(5.4, 0.6, 6.4), '#e8c46a', { kind: 'metal', x: sx, y: 16 });
    stage.addBox(sx, -58, 5, 6);
  }
  // throne hall inside
  b.add(G.box(30, 12, 14), '#d8c09a', { x: 0, y: 6, z: -74 });
  ziggurat(b, { x: -70, y: 0, z: -150 });
  // processional way lined with lions and palms
  for (let z = -48; z < 66; z += 9) {
    for (const sx of [-7.5, 7.5]) {
      if (z > -50 && z < -40) continue;
      palmTree(b, { x: sx * 1.25, y: 0, z }, rng);
      stage.addCircle(sx * 1.25, z, 0.5);
    }
  }
  // city blocks
  const occupied = (x: number, z: number, r: number) =>
    Math.abs(x) < 13 + r ||
    (x > GARDEN.x0 - 4 && x < GARDEN.x1 + 4 && z > GARDEN.z0 - 4 && z < GARDEN.z1 + 4) ||
    Math.hypot(x - HOUSE.x, z - HOUSE.z) < 10 + r ||
    Math.hypot(x - DEN.x, z - DEN.z) < 13 + r ||
    z < -50;
  for (let bx = -66; bx <= 66; bx += 13) {
    for (let bz = -40; bz <= 66; bz += 13) {
      const x = bx + rand(rng, -1.5, 1.5);
      const z = bz + rand(rng, -1.5, 1.5);
      if (occupied(x, z, 3)) continue;
      const w = rand(rng, 6, 9);
      const d = rand(rng, 6, 9);
      house(b, { x, y: 0, z }, w, d, rand(rng, 4, 8), rng() < 0.5 ? '#c9a578' : '#b8946a', { door: true });
      stage.addBox(x, z, w, d);
    }
  }
  // market stalls along the avenue
  for (let i = 0; i < 6; i++) {
    const z = -20 + i * 14;
    const sx = i % 2 ? 15.5 : -15.5;
    if (occupied(sx + (sx > 0 ? -2 : 2), z, 0) && Math.abs(sx) < 13) continue;
    stall(b, { x: sx, y: 0, z, ry: sx > 0 ? -Math.PI / 2 : Math.PI / 2 }, ['#c0462e', '#2f6f8f', '#c9a24a'][i % 3], rng);
    stage.addBox(sx, z, 2.6, 2.6);
  }

  // Royal garden with hedges (stealth area)
  b.add(G.box(GARDEN.x1 - GARDEN.x0, 1.6, 0.6), '#d8c09a', { x: (GARDEN.x0 + GARDEN.x1) / 2, y: 0.8, z: GARDEN.z0 });
  b.add(G.box(0.6, 1.6, GARDEN.z1 - GARDEN.z0), '#d8c09a', { x: GARDEN.x0, y: 0.8, z: (GARDEN.z0 + GARDEN.z1) / 2 });
  stage.addBox((GARDEN.x0 + GARDEN.x1) / 2, GARDEN.z0, GARDEN.x1 - GARDEN.x0, 0.6);
  stage.addBox(GARDEN.x0, (GARDEN.z0 + GARDEN.z1) / 2, 0.6, GARDEN.z1 - GARDEN.z0);
  const hedgeRows: [number, number, number, number][] = [
    [-30, -22, 10, 1.4],
    [-54, -22, 8, 1.4],
    [-26, -32, 1.4, 9],
    [-58, -32, 1.4, 9],
    [-36, -28, 6, 1.4],
    [-49, -28, 6, 1.4],
    [-33, -43, 7, 1.4],
    [-52, -43, 7, 1.4],
  ];
  for (const [x, z, w, d] of hedgeRows) {
    b.add(G.box(w, 1.5, d), '#3f6a32', { x, y: 0.75, z, jitter: 0.1 });
    stage.addBox(x, z, w, d);
    hedges.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
  }
  for (let i = 0; i < 10; i++) {
    const x = rand(rng, GARDEN.x0 + 3, GARDEN.x1 - 3);
    const z = rand(rng, GARDEN.z0 + 3, GARDEN.z1 - 3);
    if (Math.hypot(x - GAZEBO.x, z - GAZEBO.z) < 7) continue;
    cypress(b, { x, y: 0, z, s: 0.8 }, rng);
    stage.addCircle(x, z, 0.6);
  }
  // pergola where the officials meet
  for (const [dx, dz] of [
    [-3, -3],
    [3, -3],
    [-3, 3],
    [3, 3],
  ]) {
    b.add(G.cyl(0.25, 0.3, 3.4, 8), '#efe6d2', { x: GAZEBO.x + dx, y: 1.7, z: GAZEBO.z + dz });
    stage.addCircle(GAZEBO.x + dx, GAZEBO.z + dz, 0.35);
  }
  b.add(G.box(7.2, 0.3, 7.2), '#c9a24a', { x: GAZEBO.x, y: 3.5, z: GAZEBO.z });
  stage.water(4, 4, GAZEBO.x, 0.15, GAZEBO.z + 7, { deep: '#1f4a6a', shallow: '#6ab0c8', amp: 0.02, foam: 0.05 }, 2);

  // Daniel's house: upper room with windows open toward Jerusalem (west)
  b.at({ x: HOUSE.x, y: 0, z: HOUSE.z }, () => {
    b.add(G.box(9, 4, 8), '#d8b88a', { y: 2 });
    b.add(G.box(6, 3.4, 6), '#e2c69a', { y: 5.7, x: 0.5 });
    b.add(G.box(0.2, 1.4, 1.4), '#ffd98a', { kind: 'glow', x: -2.55, y: 5.9, z: 0 });
    b.add(G.box(0.25, 1.6, 0.2), '#6a4a2a', { x: -2.6, y: 5.9, z: 0.8 });
    b.add(G.box(0.25, 1.6, 0.2), '#6a4a2a', { x: -2.6, y: 5.9, z: -0.8 });
    b.add(G.box(1.1, 2, 0.15), '#4a3020', { y: 1, z: 4.01 });
    for (let i = 0; i < 6; i++) b.add(G.box(1.2, 0.3, 0.5), '#c9a578', { x: 4.6 + 0.3, y: 0.15 + i * 0.6, z: -3 + i * 0.6, sy: 1 + i * 2 });
  });
  stage.addBox(HOUSE.x, HOUSE.z, 9, 8);

  // The lions' den
  b.at({ x: DEN.x, y: 0, z: DEN.z }, () => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      b.add(G.box(2.6, 1.1, 1.2), '#8a7a62', { x: Math.sin(a) * 6.4, y: 0.4, z: Math.cos(a) * 6.4, ry: a });
    }
    b.add(G.cyl(6, 5.5, 4.5, 16, ), '#4a3a2c', { y: -2.2 });
  });
  stage.addCircle(DEN.x, DEN.z, 7);
  const sb = new Builder();
  sb.add(G.cyl(6.4, 6.4, 0.6, 16), '#9a8a72', { jitter: 0.05 });
  sb.add(G.cyl(0.5, 0.5, 0.2, 10), '#c84a3a', { y: 0.35, x: 1.5 });
  sb.add(G.cyl(0.5, 0.5, 0.2, 10), '#e6b93a', { kind: 'metal', y: 0.35, x: -1.5 });
  denStone = sb.build();
  denStone.position.set(DEN.x, -6, DEN.z);
  denStone.visible = false;
  stage.scene.add(denStone);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const ln = stage.addAnimal('lion', DEN.x + Math.sin(a) * 3, DEN.z + Math.cos(a) * 3);
    ln.mode = 'wander';
    ln.home.set(DEN.x, 0, DEN.z);
    ln.wanderRadius = 2.5;
    lions.push(ln);
  }
  for (let i = 0; i < 18; i++) jar(b, { x: rand(rng, -60, 60), y: 0, z: rand(rng, -40, 66) }, i % 2 ? '#2a52a8' : '#b5653a');

  // People
  crowd = new Crowd(Math.round(70 * Math.max(0.6, stage.svc.quality.particles)), rng);
  for (let i = 0; i < crowd.count; i++) {
    const z = rand(rng, -40, 62);
    const x = rand(rng, -5, 5);
    crowd.place(i, x, z, rng() * 6);
    crowd.walkTo(i, rand(rng, -5, 5), rand(rng, -40, 62), rand(rng, 0.8, 1.6));
  }
  stage.scene.add(crowd.group);
  stage.onUpdate((dt) => {
    crowd.update(dt, (x, z) => stage.heightAt(x, z));
    for (let i = 0; i < crowd.count; i++) {
      const p = crowd.people[i];
      if (p.tx === undefined && Math.random() < dt * 0.3) crowd.walkTo(i, rand(Math.random, -5, 5), rand(Math.random, -40, 62), rand(Math.random, 0.8, 1.6));
    }
  });

  scribe = stage.addNPC('Palace scribe', { ...LOOKS.scribe }, 8, -40, Math.PI, '#c9b48a');
  daniel = stage.addNPC('Daniel', { ...LOOKS.daniel }, 4, -48, 0, '#3f4f8a');
  darius = stage.addNPC('King Darius', { ...LOOKS.darius }, 0, -66, 0, '#6a2a6a');
  darius.char.root.visible = false;
  servant = stage.addNPC('Daniel’s servant', { ...LOOKS.servant }, HOUSE.x - 6, HOUSE.z + 5, -Math.PI / 2, '#8a7a6a');
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const o = stage.addNPC(i === 0 ? 'Jealous official' : 'Official', { ...LOOKS.official, robe: ['#7a2a2a', '#2a5a3a', '#5a3a6a'][i] }, GAZEBO.x + Math.sin(a) * 1.6, GAZEBO.z + Math.cos(a) * 1.6, a + Math.PI);
    o.showTag = false;
    officials.push(o);
  }
  // Garden guards and their patrol routes
  const routes: [number, number][][] = [
    [[-24, -18], [-24, -45], [-34, -45], [-34, -18]],
    [[-60, -18], [-60, -45], [-50, -45], [-50, -18]],
    [[-36, -25], [-48, -25], [-48, -30], [-36, -30]],
  ];
  for (const path of routes) {
    const g = stage.addNPC('Guard', { ...LOOKS.guard }, path[0][0], path[0][1], 0, '#2a3a6a');
    g.showTag = false;
    g.manual = true;
    const half = 0.55;
    const coneGeo = new THREE.CircleGeometry(9, 20, Math.PI / 2 - half, half * 2);
    coneGeo.rotateX(-Math.PI / 2);
    const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.22, depthWrite: false }));
    cone.visible = false;
    stage.scene.add(cone);
    guards.push({ npc: g, cone, path, idx: 1, wait: 0 });
  }
  for (const [x, z] of [
    [-10, -45],
    [12, -30],
    [-10, 20],
    [10, 40],
    [30, 30],
  ]) stage.addFlame(x, 3.2, z, 0.8, false, '#ffb050');
  for (const [x, z] of [
    [-10, -45],
    [12, -30],
    [-10, 20],
    [10, 40],
    [30, 30],
  ]) {
    b.add(G.cyl(0.08, 0.1, 3.2, 5), '#3a2a1a', { x, y: 1.6, z });
  }

  stage.fragment(META.fragments[0], 22, -46);
  stage.fragment(META.fragments[1], HOUSE.x - 6.5, HOUSE.z - 3);
  stage.fragment(META.fragments[2], DEN.x + 9, DEN.z + 6);

  stage.player.teleport(0, -30, Math.PI, stage);
}

async function play(stage: Stage): Promise<number> {
  const cam = stage.svc.cam;
  const hud = stage.svc.ui.hud;
  stage.ambient('crowd', 0.3);
  stage.ambient('wind', 0.15);

  await stage.cinematic(async () => {
    cam.cut({ x: 30, y: 26, z: 40 }, { x: 0, y: 6, z: -50 });
    await stage.narrate('Babylon. It pleased Darius to set over the kingdom one hundred twenty local governors.', 'Daniel 6:1');
    await cam.moveTo(stage.runner, { x: 12, y: 4, z: -36 }, { x: 4, y: 1.6, z: -48 }, 4);
    await stage.narrate('Daniel was distinguished above the presidents and the local governors, because an excellent spirit was in him; and the king thought to set him over the whole realm.', 'Daniel 6:3');
    await cam.moveTo(stage.runner, { x: 3, y: 3, z: -24 }, { x: 0, y: 1.6, z: -30 }, 2.5);
  });
  void daniel.walkTo(stage.runner, 30, -5, 1.4).catch(() => undefined);

  stage.objective('Talk to the palace scribe', scribe);
  await stage.waitTalk(scribe);
  await stage.talk([
    stage.line(scribe, 'Did you see him? That was Daniel. He has served the kings of Babylon since he was carried here as a young man from Jerusalem.'),
    stage.line(scribe, 'The king wants to put him over the whole kingdom, and the other officials are furious. They have searched his work for any mistake…'),
    stage.line(scribe, '…but they could find no occasion or fault, because he was faithful.', 'Daniel 6:4'),
    stage.line(scribe, 'Right now a group of them are whispering in the royal garden. If you want to know what they’re planning, stay out of sight of the guards!'),
  ]);

  // ---- Stealth
  void stage.setAtmosphere('golden', 3);
  stage.objective('Sneak close to the officials and overhear them', GAZEBO);
  stage.toast('Stay out of the guards’ yellow vision cones. Hedges hide you.', 'info');
  for (const g of guards) g.cone.visible = true;
  let progress = 0;
  let spotted = 0;
  let caught = false;
  const whispers = [
    { at: 0.34, text: '“…a law that he cannot obey…”' },
    { at: 0.67, text: '“…he prays to his God three times a day. Everyone knows it…”' },
  ];
  let wi = 0;
  const stop = stage.onUpdate((dt) => {
    const pp = stage.player.position;
    for (const g of guards) {
      const tgt = g.path[g.idx];
      const p = g.npc.position;
      const dx = tgt[0] - p.x;
      const dz = tgt[1] - p.z;
      const d = Math.hypot(dx, dz);
      if (g.wait > 0) {
        g.wait -= dt;
        g.npc.char.speed = 0;
        g.npc.char.turnTo(g.npc.char.heading + Math.sin(stage.runner.time * 1.5) * 0.02, dt, 2);
      } else if (d < 0.3) {
        g.idx = (g.idx + 1) % g.path.length;
        g.wait = 1.2;
      } else {
        const sp = 2.1;
        p.x += (dx / d) * sp * dt;
        p.z += (dz / d) * sp * dt;
        g.npc.char.turnTo(Math.atan2(dx, dz), dt, 6);
        g.npc.char.speed = sp;
      }
      g.cone.position.set(p.x, 0.06, p.z);
      g.cone.rotation.y = g.npc.char.heading + Math.PI;
      // detection
      const vx = pp.x - p.x;
      const vz = pp.z - p.z;
      const dist = Math.hypot(vx, vz);
      const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(vx, vz) - g.npc.char.heading), Math.cos(Math.atan2(vx, vz) - g.npc.char.heading)));
      const sees = dist < 9 && ang < 0.55 && !blocked(p.x, p.z, pp.x, pp.z);
      (g.cone.material as THREE.MeshBasicMaterial).color.set(sees ? '#ff4a3a' : '#ffd24a');
      if (sees && !caught && !stage.svc.ui.busy) caught = true;
    }
    const near = Math.hypot(pp.x - GAZEBO.x, pp.z - GAZEBO.z) < 7.5;
    if (near && !caught) progress = Math.min(1, progress + dt / 8);
    hud.setMeter('hear', near ? 'Overhearing…' : 'Get closer to the officials', progress, '#b9a8ff');
    if (wi < whispers.length && progress >= whispers[wi].at) {
      stage.toast(whispers[wi].text, 'info');
      wi++;
    }
  });
  while (progress < 1) {
    await stage.waitUntil(() => caught || progress >= 1);
    if (progress >= 1) break;
    spotted++;
    stage.sfx('error');
    hud.setBanner('Spotted!', 'A guard saw you. Try again, and use the hedges.');
    await stage.svc.ui.story.fade(1, 0.4);
    stage.player.teleport(ENTRY.x, ENTRY.z, Math.PI * 1.25, stage);
    cam.snapBehind(stage.player.position, Math.PI * 1.25);
    progress *= 0.5;
    wi = whispers.filter((w) => w.at <= progress).length;
    await stage.wait(0.6);
    hud.setBanner(null);
    await stage.svc.ui.story.fade(0, 0.4);
    caught = false;
  }
  stop();
  hud.setMeter('hear', null);
  for (const g of guards) g.cone.visible = false;
  const gameStars = spotted === 0 ? 3 : spotted <= 2 ? 2 : 1;
  stage.addXP(spotted === 0 ? 120 : 60, spotted === 0 ? 'Unseen!' : 'Overheard the plot');
  const off = officials[0];
  await stage.talk([
    stage.line(off, '“We won’t find any occasion against this Daniel, unless we find it against him concerning the law of his God.”', 'Daniel 6:5'),
    stage.line(officials[1], 'Then we’ll ask the king for a decree: whoever asks a petition of any god or man for thirty days, except of the king, shall be cast into the den of lions.', 'Daniel 6:7'),
    stage.line(officials[2], 'Darius loves to be honoured. He will sign it. And Daniel? Daniel will keep praying. He always does.'),
  ]);

  // ---- The decree is signed
  await stage.cinematic(async () => {
    darius.char.root.visible = true;
    darius.place(0, -52, 0, stage);
    officials.forEach((o, i) => o.place(-3 + i * 3, -46, Math.PI, stage));
    cam.cut({ x: 8, y: 3, z: -42 }, { x: 0, y: 2, z: -51 });
    darius.setPose('point');
    stage.sfx('page');
    await stage.narrate('Therefore king Darius signed the writing and the decree.', 'Daniel 6:9');
    darius.setPose('idle');
  });

  // ---- Daniel's window
  void stage.setAtmosphere('dusk', 6);
  daniel.stop();
  daniel.place(HOUSE.x - 1.5, HOUSE.z, -Math.PI / 2, stage);
  daniel.char.root.position.y = 4.3;
  daniel.setPose('pray');
  daniel.talkRadius = 9;
  stage.chatter(servant, [[stage.line(servant, 'My master has prayed at that window, toward Jerusalem, every day for as long as I have served him.')]]);
  let servantQuiz = false;
  stage.objective('Go to Daniel’s house and warn him', () => new THREE.Vector3(HOUSE.x - 7, 0, HOUSE.z));
  await stage.waitInteract(() => new THREE.Vector3(HOUSE.x - 4.5, 0, HOUSE.z), 'Call up to Daniel', 5);
  await stage.narrate('When Daniel knew that the writing was signed, he went into his house (now his windows were open in his room toward Jerusalem) and he kneeled on his knees three times a day, and prayed, and gave thanks before his God, as he did before.', 'Daniel 6:10');
  const dp = await stage.talk([
    stage.line(daniel, 'Peace to you, friend. Yes, I know about the decree.'),
    { ...stage.line(daniel, 'I have prayed toward Jerusalem three times a day for many years. I will not stop now, and I will not hide.'), choices: ['At least close the window!', 'Aren’t you afraid?'] },
  ]);
  await stage.talk([
    dp[0] === 0
      ? stage.line(daniel, 'If I close the window today, what am I telling the king? That my God matters only when it is safe. No. The window stays open.')
      : stage.line(daniel, 'A little. I am an old man, and lions are lions. But I fear God more than I fear the den.'),
    stage.line(daniel, 'Whatever happens, God is faithful. Now go. They are coming.'),
  ]);
  if (!servantQuiz) {
    servantQuiz = true;
    await stage.quiz('Daniel’s servant', {
      q: 'How many times a day did Daniel pray?',
      options: ['Once, at sunset', 'Three times a day', 'Seven times a day', 'Only on the Sabbath'],
      answer: 1,
      explain: 'Daniel “kneeled on his knees three times a day, and prayed, and gave thanks before his God, as he did before.” The decree changed nothing about his habit.',
      ref: 'Daniel 6:10',
    });
  }

  // ---- Caught, the king's distress, the den
  await stage.cinematic(async () => {
    officials.forEach((o, i) => o.place(HOUSE.x - 9, HOUSE.z - 2 + i * 2, Math.PI / 2, stage));
    officials[0].setPose('point');
    cam.cut({ x: HOUSE.x - 16, y: 3, z: HOUSE.z + 8 }, { x: HOUSE.x - 2, y: 4, z: HOUSE.z });
    await stage.narrate('Then these men assembled together, and found Daniel making petition and supplication before his God.', 'Daniel 6:11');
    officials[0].setPose('idle');
    cam.cut({ x: 6, y: 3, z: -44 }, { x: 0, y: 2, z: -52 });
    darius.setPose('cower');
    await stage.narrate('Then the king, when he heard these words, was very displeased, and set his heart on Daniel to deliver him; and he labored until the going down of the sun to rescue him.', 'Daniel 6:14');
    void stage.setAtmosphere('night', 3);
    stage.ambient('night', 0.4);
    stage.ambient('crowd', 0, 2);
    darius.setPose('idle');
    daniel.char.root.position.y = 0;
    daniel.place(DEN.x - 7.5, DEN.z, Math.PI / 2, stage);
    darius.place(DEN.x - 9, DEN.z + 3, Math.PI / 2, stage);
    cam.cut({ x: DEN.x - 16, y: 6, z: DEN.z + 10 }, { x: DEN.x, y: 0, z: DEN.z });
    stage.sfx('roar', 0.7);
    await stage.narrate('Then the king commanded, and they brought Daniel, and cast him into the den of lions. The king spoke and said to Daniel, “Your God whom you serve continually, he will deliver you.”', 'Daniel 6:16');
    await stage.tween(1.5, (t) => daniel.char.root.position.set(lerp3(DEN.x - 7.5, DEN.x, t), -3.9 * t, DEN.z));
    denStone.visible = true;
    await stage.tween(2, (t) => (denStone.position.y = -6 + 6.3 * Ease.out(t)));
    stage.sfx('thud');
    await stage.narrate('A stone was brought, and laid on the mouth of the den; and the king sealed it with his own signet, that nothing might be changed concerning Daniel.', 'Daniel 6:17');
    cam.cut({ x: 14, y: 10, z: -30 }, { x: 0, y: 6, z: -70 });
    await stage.narrate('Then the king went to his palace, and passed the night fasting… and his sleep fled from him.', 'Daniel 6:18');
  });

  // ---- Dawn run with the king
  void stage.setAtmosphere('dawn', 4);
  stage.ambient('night', 0, 3);
  darius.place(0, -46, Math.PI, stage);
  stage.player.teleport(2, -42, Math.PI, stage);
  cam.snapBehind(stage.player.position, Math.PI);
  await stage.narrate('Then the king arose very early in the morning, and went in haste to the den of lions.', 'Daniel 6:19');
  stage.objective('Keep up with King Darius!', darius);
  stage.music({ root: 52, scale: SCALES.hijaz, bpm: 124, instrument: 'oud', drone: 0.6, drums: 'frame', density: 0.55 });
  let far = 0;
  const watch = stage.onUpdate((dt) => {
    const d = darius.position.distanceTo(stage.player.position);
    hud.setMeter('king', d < 10 ? 'Right behind the king!' : 'Catch up!', Math.max(0, 1 - d / 20), d < 10 ? '#5fd38d' : '#ff7a6b');
    if (d > 12) far += dt;
  });
  await darius.walkPath(stage.runner, [[0, -20], [0, 20], [6, 34], [22, 44], [DEN.x - 9, DEN.z]], 5.4);
  await stage.waitUntil(() => stage.player.position.distanceTo(darius.position) < 9);
  watch();
  hud.setMeter('king', null);
  stage.objective(null);
  if (far < 3) stage.addXP(40, 'Kept up with the king');

  // ---- Daniel alive
  await stage.cinematic(async () => {
    darius.face(DEN.x, DEN.z);
    cam.cut({ x: DEN.x - 14, y: 4, z: DEN.z - 6 }, { x: DEN.x - 7, y: 1.6, z: DEN.z });
    await stage.narrate('When he came near to the den, he cried with a troubled voice: “Daniel, servant of the living God, is your God, whom you serve continually, able to deliver you from the lions?”', 'Daniel 6:20');
    await stage.tween(2.2, (t) => (denStone.position.x = DEN.x + t * 8));
    stage.sfx('rumble', 0.5);
    const light = stage.addField(
      new ParticleField({
        count: 90,
        color: '#fff2c0',
        size: 1.2,
        spawn: (p, v) => {
          p.set(DEN.x + rand(Math.random, -4, 4), -3 + Math.random() * 2, DEN.z + rand(Math.random, -4, 4));
          v.set(0, 1 + Math.random() * 1.5, 0);
          return 3 + Math.random() * 2;
        },
      }),
    );
    for (const ln of lions) ln.mode = 'idle';
    cam.cut({ x: DEN.x - 3, y: 6, z: DEN.z - 5 }, { x: DEN.x, y: -3.5, z: DEN.z });
    daniel.setPose('idle');
    daniel.face(DEN.x - 9, DEN.z);
    await stage.narrate('Then Daniel said to the king, “O king, live forever! My God has sent his angel, and has shut the lions’ mouths, and they have not hurt me.”', 'Daniel 6:21–22');
    await stage.tween(2, (t) => daniel.char.root.position.set(lerp3(DEN.x, DEN.x - 7.5, t), lerp3(-3.9, 0, t), DEN.z));
    light.emitting = false;
    darius.setPose('cheer');
    stage.sfx('fanfare');
    await stage.narrate('So Daniel was taken up out of the den, and no kind of harm was found on him, because he had trusted in his God.', 'Daniel 6:23');
    darius.setPose('idle');
    await stage.narrate('King Darius wrote to all the peoples: “…for he is the living God, and steadfast forever. He delivers and rescues… who has delivered Daniel from the power of the lions.”', 'Daniel 6:26–27');
  });
  stage.music({ root: 57, scale: SCALES.mixolydian, bpm: 100, instrument: 'harp', drone: 0.5, drums: 'soft', density: 0.45 });
  stage.objective('Talk to Daniel', daniel);
  daniel.talkRadius = 3.5;
  await stage.waitTalk(daniel);
  await stage.talk([
    stage.line(daniel, 'You came back! Thank you for standing with me, friend.'),
    stage.line(daniel, 'When you are pressured to hide what you believe, remember this night. Remember what I told the king.'),
  ]);
  await stage.verse(META.verseId);
  return gameStars;
}

function lerp3(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const danielEra: EraModule = {
  atmosphere: 'day',
  music: { root: 50, scale: SCALES.hijaz, bpm: 84, instrument: 'oud', drone: 0.7, drums: 'soft', density: 0.38 },
  setup,
  play,
};

export default danielEra;
