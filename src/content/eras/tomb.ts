import * as THREE from 'three';
import type { EraModule } from '../eraTypes';
import type { Stage } from '../../world/Stage';
import { Builder, G, roughen } from '../../world/geo';
import { Noise2D, rand } from '../../engine/noise';
import { SCALES } from '../../engine/Audio';
import { house, wall, tower, oliveTree, flowers, grass, jar, crate, stall, cypress } from '../../world/props';
import { lerpColor } from '../../world/Terrain';
import { ParticleField } from '../../world/Particles';
import { ERA_BY_ID } from '../catalog';
import type { NPC } from '../../world/actors';
import type { Look } from '../../world/Character';

const META = ERA_BY_ID.tomb;
const WALL_X = -3;
const GATE_Z0 = 8;
const GATE_Z1 = 16;
const TOMB = { x: 64, z: 0 }; // front face x
const CH = { x0: 64.4, x1: 69.6, z0: -2.6, z1: 2.6, h: 2.7 };

let peter: NPC, john: NPC, mary: NPC, angel1: NPC, angel2: NPC;
let tombCap: THREE.Group;

const LOOKS: Record<string, Look> = {
  peter: { skin: '#8d5a3b', robe: '#2f5a7a', sash: '#d8c8a8', hair: 'short', hairColor: '#4a4440', beard: 'long', beardColor: '#5a5450' },
  john: { skin: '#9c6a45', robe: '#a8402e', sash: '#e0c080', hair: 'long', hairColor: '#2a1a12' },
  mary: { skin: '#9c6a45', robe: '#3a4a6a', robe2: '#4a5a7a', sash: '#c9a24a', hair: 'long', hairColor: '#2a1a12', headwear: 'veil', headwearColor: '#6a5a7a' },
  disciple: { skin: '#8d5a3b', robe: '#6a5a4a', sash: '#5a4030', hair: 'short', beard: 'short', headwear: 'headwrap', headwearColor: '#c9b48a' },
  angel: { skin: '#c99470', robe: '#ffffff', robe2: '#ffffff', sash: '#ffe9a8', hair: 'long', hairColor: '#e8dcc0', glow: true },
};

const PATH: [number, number][] = [
  [-46, 0],
  [-30, 0],
  [-24, 12],
  [WALL_X + 4, 12],
  [22, 8],
  [44, 2],
  [TOMB.x - 3.2, 0.6],
];

function setup(stage: Stage): void {
  const noise = new Noise2D(83);
  const rng = stage.rng;
  const ground = (x: number, z: number) => noise.fbm(x * 0.012, z * 0.012, 3) * 1.2 + (x > 75 ? (x - 75) * 0.6 : 0);
  stage.heightFn = (x, z) => (x > CH.x0 - 0.5 && x < CH.x1 && z > CH.z0 && z < CH.z1 ? ground(TOMB.x, 0) : ground(x, z));
  stage.terrain({
    size: 300,
    segments: 120,
    height: ground,
    color: (x, z) => {
      if (x < WALL_X) {
        const street = Math.abs(z) < 3.2 || (Math.abs(z - 12) < 3.2 && x > -27) || (Math.abs(x + 27) < 3.2 && z > -2 && z < 14);
        return street ? lerpColor('#b8a88a', '#a8987a', ((Math.floor(x) + Math.floor(z)) & 1) * 0.5) : '#a89878';
      }
      if (x > 72) return lerpColor('#9a8f80', '#b0a490', noise.get(x * 0.1, z * 0.1) * 0.5 + 0.5);
      return lerpColor('#5f8f3e', '#7aa84f', noise.get(x * 0.05, z * 0.05) * 0.5 + 0.5);
    },
  });
  stage.bounds = { x0: -66, x1: 74, z0: -40, z1: 40 };
  const b = stage.statics;

  // City streets
  const onStreet = (x: number, z: number, pad: number) =>
    Math.abs(z) < 3.5 + pad || (Math.abs(z - 12) < 3.5 + pad && x > -28 - pad) || (Math.abs(x + 27) < 3.5 + pad && z > -3 && z < 15);
  for (let bx = -64; bx <= -10; bx += 9) {
    for (let bz = -36; bz <= 36; bz += 9) {
      const w = rand(rng, 6, 8);
      const d = rand(rng, 6, 8);
      if (onStreet(bx, bz, Math.max(w, d) / 2 + 0.5) || Math.hypot(bx + 52, bz) < 9) continue;
      house(b, { x: bx, y: ground(bx, bz) - 0.2, z: bz }, w, d, rand(rng, 4, 8), rng() < 0.5 ? '#d8c8a8' : '#c9b48a', { door: true });
      stage.addBox(bx, bz, w, d);
    }
  }
  // the courtyard house where the disciples are
  house(b, { x: -56, y: 0, z: -9 }, 10, 6, 6, '#e2d2b0', { stairs: true });
  stage.addBox(-56, -9, 10, 6);
  b.add(G.box(10, 1.4, 0.4), '#d8c8a8', { x: -56, y: 0.7, z: 6 });
  stage.addBox(-56, 6, 10, 0.4);
  // City wall with a gate
  wall(b, WALL_X, -42, WALL_X, GATE_Z0, 0, 9, 3, '#c9b48a');
  wall(b, WALL_X, GATE_Z1, WALL_X, 42, 0, 9, 3, '#c9b48a');
  stage.addWallCollider(WALL_X, -42, WALL_X, GATE_Z0, 3);
  stage.addWallCollider(WALL_X, GATE_Z1, WALL_X, 42, 3);
  tower(b, { x: WALL_X, y: 0, z: GATE_Z0 - 1.5 }, 2.6, 12, '#b8a07a');
  tower(b, { x: WALL_X, y: 0, z: GATE_Z1 + 1.5 }, 2.6, 12, '#b8a07a');
  stage.addCircle(WALL_X, GATE_Z0 - 1.5, 2.8);
  stage.addCircle(WALL_X, GATE_Z1 + 1.5, 2.8);
  b.add(G.box(3.2, 2, GATE_Z1 - GATE_Z0 + 2), '#b8a07a', { x: WALL_X, y: 8, z: (GATE_Z0 + GATE_Z1) / 2 });
  // obstacles in the streets
  const obstacles: [number, number][] = [
    [-38, 1.4],
    [-33, -1.6],
    [-27, 6],
    [-18, 13.5],
    [-12, 10.4],
    [-8, 13],
  ];
  obstacles.forEach(([x, z], i) => {
    if (i % 3 === 0) {
      b.at({ x, y: ground(x, z), z, ry: rand(rng, 0, 3) }, () => {
        b.add(G.box(1.4, 0.6, 2.4), '#7a5a3a', { y: 0.7 });
        b.add(G.cyl(0.5, 0.5, 0.12, 10), '#4a3020', { x: 0.75, y: 0.5, rz: Math.PI / 2 });
        b.add(G.cyl(0.5, 0.5, 0.12, 10), '#4a3020', { x: -0.75, y: 0.5, rz: Math.PI / 2 });
      });
      stage.addBox(x, z, 1.8, 2.6);
    } else {
      crate(b, { x, y: ground(x, z), z });
      crate(b, { x: x + 0.9, y: ground(x, z), z: z + 0.3 });
      stage.addBox(x + 0.45, z + 0.15, 1.8, 1.2);
    }
  });
  stall(b, { x: -44, y: 0, z: 4.6, ry: Math.PI }, '#2f6f8f', rng);
  stage.addBox(-44, 4.6, 2.6, 2.2);
  for (let i = 0; i < 12; i++) jar(b, { x: rand(rng, -60, -8), y: 0, z: rand(rng, -1, 1) > 0 ? 3.6 : -3.6 }, '#b5653a');
  const sheep = [
    [-20, 11],
    [-15, 14],
  ];
  for (const [x, z] of sheep) {
    const s = stage.addAnimal('sheep', x, z);
    s.wanderRadius = 2;
  }

  // The garden outside the wall
  for (let i = 0; i < 46; i++) {
    const x = rand(rng, 6, 70);
    const z = rand(rng, -38, 38);
    if (Math.abs(z - 4 + (x - 6) * 0.15) < 5 || (x > 55 && Math.abs(z) < 9)) continue;
    if (i % 4 === 0) cypress(b, { x, y: ground(x, z), z }, rng);
    else oliveTree(b, { x, y: ground(x, z), z }, rng);
    stage.addCircle(x, z, 0.8);
  }
  grass(b, Math.round(900 * stage.svc.quality.particles), { x0: 4, x1: 70, z0: -38, z1: 38 }, ground, () => true, rng);
  flowers(b, Math.round(400 * stage.svc.quality.particles), { x0: 4, x1: 70, z0: -38, z1: 38 }, ground, () => true, rng, ['#ffffff', '#f3d34a', '#e86a8a']);

  // The rock-cut tomb
  const gy = ground(TOMB.x, 0);
  const shell = new Builder(rng);
  const R = '#a89c88';
  shell.add(G.box(1, 6, 4.6), R, { x: TOMB.x, y: gy + 3, z: -3.2, jitter: 0.08 });
  shell.add(G.box(1, 6, 4.6), R, { x: TOMB.x, y: gy + 3, z: 3.2, jitter: 0.08 });
  shell.add(G.box(1, 3.6, 1.8), R, { x: TOMB.x, y: gy + 4.2, z: 0, jitter: 0.08 });
  shell.add(G.box(5.4, CH.h, 0.6), R, { x: (CH.x0 + CH.x1) / 2, y: gy + CH.h / 2, z: CH.z0 - 0.3 });
  shell.add(G.box(5.4, CH.h, 0.6), R, { x: (CH.x0 + CH.x1) / 2, y: gy + CH.h / 2, z: CH.z1 + 0.3 });
  shell.add(G.box(0.6, CH.h, 5.8), R, { x: CH.x1 + 0.3, y: gy + CH.h / 2, z: 0 });
  // stone bench, linen cloths and the folded head cloth
  shell.add(G.box(4, 0.7, 1.1), '#b8ac98', { x: 67, y: gy + 0.35, z: 1.8 });
  shell.add(G.box(2.6, 0.06, 0.8), '#f4efe2', { kind: 'cloth', x: 66.6, y: gy + 0.74, z: 1.8, ry: 0.05 });
  shell.add(G.box(1.1, 0.08, 0.7), '#ece6d6', { kind: 'cloth', x: 65.4, y: gy + 0.75, z: 1.75, ry: -0.1 });
  shell.add(G.cyl(0.13, 0.13, 0.5, 8), '#f8f4ea', { kind: 'cloth', x: 68.6, y: gy + 0.84, z: 1.8, rx: Math.PI / 2 });
  shell.add(G.box(0.1, 0.08, 6), '#7a6e5c', { x: TOMB.x - 1, y: gy + 0.04, z: 3.5 });
  const shellG = shell.build();
  stage.scene.add(shellG);
  // hill and roof that hide the chamber from above (toggled when inside)
  const cap = new Builder(rng);
  cap.add(G.box(5.8, 0.6, 6.4), R, { x: (CH.x0 + CH.x1) / 2, y: gy + CH.h + 0.3, z: 0 });
  for (let i = 0; i < 14; i++) {
    cap.add(roughen(G.dodeca(rand(rng, 2.5, 4.5)), 0.8, rng), i % 2 ? '#9a8f7c' : '#b0a48e', {
      x: rand(rng, 66, 80),
      y: gy + rand(rng, 3, 6.5),
      z: rand(rng, -14, 14),
      jitter: 0.1,
    });
  }
  for (let i = 0; i < 18; i++) {
    const z = -36 + i * 4.2;
    if (Math.abs(z) < 10) continue;
    cap.add(roughen(G.dodeca(rand(rng, 3, 5)), 0.9, rng), '#a89c88', { x: rand(rng, 70, 78), y: gy + rand(rng, 1, 4), z, jitter: 0.1 });
  }
  tombCap = cap.build();
  stage.scene.add(tombCap);
  // colliders: front face (with doorway), chamber walls, hillside
  stage.addBox(TOMB.x, -3.2, 1, 4.6);
  stage.addBox(TOMB.x, 3.2, 1, 4.6);
  stage.addBox((CH.x0 + CH.x1) / 2, CH.z0 - 0.3, 5.4, 0.6);
  stage.addBox((CH.x0 + CH.x1) / 2, CH.z1 + 0.3, 5.4, 0.6);
  stage.addBox(CH.x1 + 0.3, 0, 0.6, 5.8);
  stage.addBox(67, 1.8, 4, 1.1);
  stage.addBox(TOMB.x + 0.6, -20, 1.2, 30);
  stage.addBox(TOMB.x + 0.6, 20, 1.2, 30);
  // the great stone, rolled away
  const sb = new Builder();
  sb.add(G.cyl(1.7, 1.7, 0.55, 18), '#9a8f7c', { rz: Math.PI / 2, jitter: 0.06 });
  const stone = sb.build();
  stone.position.set(TOMB.x - 1, gy + 1.7, 4.6);
  stone.rotation.y = Math.PI / 2;
  stage.scene.add(stone);
  stage.addCircle(TOMB.x - 1, 4.6, 1.4);

  // People
  peter = stage.addNPC('Simon Peter', { ...LOOKS.peter }, -54, -3, 0, '#2f5a7a');
  peter.setPose('sit');
  john = stage.addNPC('John', { ...LOOKS.john }, -58, -2.5, 0.6, '#a8402e');
  for (let i = 0; i < 3; i++) {
    const d = stage.addNPC('Disciple', { ...LOOKS.disciple, robe: ['#6a5a4a', '#4a5a6a', '#5a6a4a'][i] }, -60 + i * 2.5, 1.5, Math.PI, '#6a5a4a');
    d.setPose('sit');
    d.showTag = false;
  }
  mary = stage.addNPC('Mary Magdalene', { ...LOOKS.mary }, -30, 0, -Math.PI / 2, '#3a4a6a');
  mary.char.root.visible = false;
  angel1 = stage.addNPC('Angel', { ...LOOKS.angel }, 65.4, 1.8, -Math.PI / 2, '#ffe9a8');
  angel2 = stage.addNPC('Angel', { ...LOOKS.angel }, 68.6, 1.8, -Math.PI / 2, '#ffe9a8');
  for (const a of [angel1, angel2]) {
    a.char.root.visible = false;
    a.showTag = false;
    a.setPose('sit');
  }
  for (const [x, z] of [
    [-52, 3],
    [-60, -4],
    [-36, -3],
    [-20, 9],
  ]) stage.addFlame(x, 2.4, z, 0.6, false, '#ffb050');

  stage.fragment(META.fragments[0], -40, -3);
  stage.fragment(META.fragments[1], 30, -22);
  stage.fragment(META.fragments[2], 52, 18);

  stage.player.teleport(-52, 2, -Math.PI / 2, stage);
}

async function play(stage: Stage): Promise<number> {
  const cam = stage.svc.cam;
  const hud = stage.svc.ui.hud;
  stage.ambient('wind', 0.15);
  stage.ambient('night', 0.25);

  // inside the tomb, lift the roof away and pull the camera in
  stage.onUpdate(() => {
    const p = stage.player.position;
    const inside = p.x > CH.x0 - 1.2 && p.x < CH.x1 && p.z > CH.z0 && p.z < CH.z1;
    tombCap.visible = !inside || cam.mode === 'cinematic';
    if (cam.mode === 'follow') {
      cam.distance = inside ? 3.2 : 7.5;
      cam.minPitch = inside ? 0.7 : -0.15;
      if (inside && cam.pitch < 0.7) cam.pitch = 0.9;
    }
  });

  await stage.cinematic(async () => {
    cam.cut({ x: 40, y: 18, z: 30 }, { x: TOMB.x, y: 2, z: 0 });
    await stage.narrate('Jesus had been crucified, and his body was laid in a new tomb cut out of the rock, in a garden. A great stone was rolled across the door.', 'John 19:41–42; Matthew 27:60');
    await cam.moveTo(stage.runner, { x: -40, y: 10, z: 22 }, { x: -55, y: 1, z: -2 }, 5);
    await stage.narrate('His friends were hiding in Jerusalem, heartbroken. It was the first day of the week, and it was still dark.');
    await cam.moveTo(stage.runner, { x: -46, y: 3, z: 4 }, { x: -52, y: 1.4, z: 2 }, 2.5);
  });

  stage.objective('Talk to Simon Peter', peter);
  stage.chatter(john, [[stage.line(john, 'I stood near the cross with his mother. He asked me to take care of her, so I took her into my home.', 'John 19:26–27')]]);
  await stage.waitTalk(peter);
  await stage.talk([
    stage.line(peter, 'I told him I would die for him. Then, in the courtyard, I said I didn’t even know him. Three times.', 'John 13:37–38; 18:27'),
    stage.line(peter, 'And the rooster crowed. And now he’s gone.'),
  ]);

  // Mary arrives
  await stage.cinematic(async () => {
    mary.char.root.visible = true;
    mary.place(-30, 0, -Math.PI / 2, stage);
    void mary.walkTo(stage.runner, -50, 1.5, 6).catch(() => undefined);
    cam.cut({ x: -50, y: 2.4, z: 6 }, { x: -40, y: 1.5, z: 0 });
    await stage.narrate('Mary Magdalene went early, while it was still dark, to the tomb, and saw the stone taken away from the tomb.', 'John 20:1');
    await stage.wait(1.5);
  });
  peter.setPose('idle');
  await stage.talk([
    stage.line(mary, '“They have taken away the Lord out of the tomb, and we don’t know where they have laid him!”', 'John 20:2'),
    stage.n('Therefore Peter and the other disciple went out, and they went toward the tomb. They both ran together.', 'John 20:3–4'),
    stage.line(john, 'Run!'),
  ]);

  // ---- The race
  void stage.setAtmosphere('dawn', 50);
  stage.ambient('night', 0, 20);
  stage.music({ root: 57, scale: SCALES.aeolian, bpm: 128, instrument: 'oud', drone: 0.5, drums: 'march', density: 0.5 });
  stage.player.useStamina = true;
  stage.player.stamina = 1;
  mary.char.root.visible = false;
  peter.place(-47, -1, -Math.PI / 2, stage);
  john.place(-47, 1.5, -Math.PI / 2, stage);
  stage.player.teleport(-48, 0.3, -Math.PI / 2, stage);
  cam.snapBehind(stage.player.position, -Math.PI / 2);
  let t = 0;
  let peterT = 0;
  let playerT = 0;
  hud.setBanner('Ready…');
  await stage.wait(0.9);
  hud.setBanner('Run!', 'Hold Shift (or Run) to sprint. Watch your stamina!');
  setTimeout(() => hud.setBanner(null), 1600);
  stage.objective('Run to the tomb!', new THREE.Vector3(TOMB.x - 3, 0, 0));
  const johnRun = john.walkPath(stage.runner, PATH.map(([x, z]) => [x, z + 0.8] as [number, number]), 7.0);
  const peterRun = peter.walkPath(stage.runner, PATH.map(([x, z]) => [x, z - 0.8] as [number, number]), 6.3);
  void johnRun.catch(() => undefined);
  void peterRun
    .then(() => {
      peterT = t;
    })
    .catch(() => undefined);
  const stopRace = stage.onUpdate((dt) => {
    t += dt;
    hud.setMeter('stamina', 'Stamina', stage.player.stamina, stage.player.stamina > 0.25 ? '#5fd38d' : '#ff7a6b');
    if (!playerT && stage.player.position.x > TOMB.x - 6 && Math.abs(stage.player.position.z) < 6) playerT = t;
  });
  await stage.waitUntil(() => playerT > 0);
  stopRace();
  hud.setMeter('stamina', null);
  stage.player.useStamina = false;
  const beatPeter = !peterT || playerT <= peterT;
  const gameStars = beatPeter ? 3 : playerT - peterT < 5 ? 2 : 1;
  stage.addXP(beatPeter ? 100 : 50, beatPeter ? 'Faster than Peter!' : 'Reached the tomb');
  if (beatPeter && john.position.x < TOMB.x - 6) stage.toast('Whoa, you even beat John! (John 20:4 says he outran Peter.)', 'good');
  await stage.waitUntil(() => peter.position.x > TOMB.x - 6);
  stage.objective(null);

  // ---- At the tomb
  await stage.cinematic(async () => {
    john.place(TOMB.x - 1.6, 0.8, Math.PI / 2, stage);
    john.setPose('cower');
    peter.place(TOMB.x - 4, -1.2, Math.PI / 2, stage);
    cam.cut({ x: TOMB.x - 7, y: 2.2, z: 4 }, { x: TOMB.x, y: 1.4, z: 0 });
    await stage.narrate('The other disciple outran Peter, and came to the tomb first. Stooping and looking in, he saw the linen cloths lying, yet he didn’t enter in.', 'John 20:4–5');
    john.setPose('idle');
    void peter.walkTo(stage.runner, 66, -1.2, 2).catch(() => undefined);
    await stage.narrate('Then Simon Peter came, following him, and entered into the tomb.', 'John 20:6');
  });
  stage.objective('Go into the tomb and look closely', new THREE.Vector3(66.5, 0, 0));
  let sawLinen = false;
  let sawCloth = false;
  stage.interactable(new THREE.Vector3(66.4, 0, 1.4), 'Look at the linen cloths', async () => {
    sawLinen = true;
    await stage.talk([stage.n('The linen cloths are lying there, flat, right where his body had been.', 'John 20:6')]);
  }, 1.8, () => !sawLinen);
  stage.interactable(new THREE.Vector3(68.6, 0, 1.4), 'Look at the folded head cloth', async () => {
    sawCloth = true;
    await stage.talk([
      stage.n('…and the cloth that had been on his head, not lying with the linen cloths, but rolled up in a place by itself.', 'John 20:7'),
      stage.line('me', '(Grave robbers wouldn’t stop to roll up a cloth. What happened here?)'),
    ]);
  }, 1.8, () => !sawCloth);
  await stage.waitUntil(() => sawLinen && sawCloth);
  stage.addXP(60, 'Looked closely');
  await stage.talk([
    stage.n('So then the other disciple who came first to the tomb also entered in, and he saw and believed. For as yet they didn’t know the Scripture, that he must rise from the dead.', 'John 20:8–9'),
    stage.line(john, 'He said it, didn’t he? Over and over. We didn’t understand.'),
    stage.n('So the disciples went away again to their own homes.', 'John 20:10'),
  ]);

  // ---- Mary in the garden
  peter.char.root.visible = false;
  john.place(20, -20, 0, stage);
  stage.player.teleport(TOMB.x - 8, -4, Math.PI / 2, stage);
  mary.char.root.visible = true;
  mary.place(TOMB.x - 2.5, 1.2, Math.PI / 2, stage);
  mary.setPose('cower');
  void stage.setAtmosphere('golden', 6);
  stage.music({ root: 60, scale: SCALES.dorian, bpm: 70, instrument: 'flute', drone: 0.7, drums: 'none', density: 0.3 });
  stage.objective('Wait with Mary in the garden', mary);
  await stage.waitUntil(() => stage.player.position.distanceTo(mary.position) < 6);
  await stage.cinematic(async () => {
    cam.cut({ x: TOMB.x - 6, y: 1.8, z: 4 }, { x: TOMB.x - 2, y: 1.2, z: 0.8 });
    await stage.narrate('But Mary was standing outside at the tomb weeping. So as she wept, she stooped and looked into the tomb…', 'John 20:11');
    angel1.char.root.visible = true;
    angel2.char.root.visible = true;
    stage.sfx('gate');
    cam.cut({ x: 65, y: 2.2, z: -1.8 }, { x: 67, y: 0.8, z: 1.6 });
    tombCap.visible = false;
    await stage.narrate('…and she saw two angels in white sitting, one at the head, and one at the feet, where the body of Jesus had lain.', 'John 20:12');
    await stage.narrate('They asked her, “Woman, why are you weeping?” She said to them, “Because they have taken away my Lord, and I don’t know where they have laid him.”', 'John 20:13');
    tombCap.visible = true;
    mary.setPose('idle');
    mary.face(TOMB.x - 12, 0);
    cam.cut({ x: TOMB.x - 4.2, y: 1.7, z: 1.6 }, { x: TOMB.x - 2.5, y: 1.55, z: 1.2 });
    const glow = stage.addField(
      new ParticleField({
        count: 120,
        color: '#fff2c8',
        size: 1.4,
        spawn: (p, v) => {
          p.set(TOMB.x - 12 + rand(Math.random, -2, 2), rand(Math.random, 0, 3), rand(Math.random, -2, 2));
          v.set(rand(Math.random, 0, 1), 0.4, rand(Math.random, -0.3, 0.3));
          return 3 + Math.random() * 2;
        },
      }),
    );
    await stage.narrate('When she had said this, she turned around and saw Jesus standing, and didn’t know that it was Jesus.', 'John 20:14');
    await stage.narrate('Jesus said to her, “Mary.”', 'John 20:16', 2.5);
    stage.sfx('chime');
    await stage.narrate('She turned and said to him, “Rabboni!” which is to say, “Teacher!”', 'John 20:16', 2);
    glow.emitting = false;
    stage.music({ root: 60, scale: SCALES.majorPent, bpm: 96, instrument: 'harp', drone: 0.6, drums: 'soft', density: 0.55 });
    stage.sfx('fanfare');
    await stage.narrate('Mary Magdalene came and told the disciples that she had seen the Lord, and that he had said these things to her.', 'John 20:18');
  });
  angel1.char.root.visible = false;
  angel2.char.root.visible = false;
  await stage.talk([
    stage.line(mary, 'He’s alive! He said my name. I have to tell the others. You come too!'),
  ]);
  await stage.quiz('Mary Magdalene', {
    q: 'Who reached the tomb first that morning?',
    options: ['Simon Peter', 'The other disciple (John)', 'Mary’s friend Joanna', 'A Roman guard'],
    answer: 1,
    explain: '“They both ran together. The other disciple outran Peter, and came to the tomb first.” But it was Peter who went in first.',
    ref: 'John 20:4–6',
  });
  void stage.setAtmosphere('day', 6);
  john.place(TOMB.x - 10, -3, Math.PI / 2, stage);
  stage.objective('Talk to John', john);
  await stage.waitTalk(john);
  await stage.talk([
    stage.line(john, 'Mary saw him! I believed when I saw the cloths, but now… now it makes sense.'),
    stage.line(john, 'Do you know what he said at Bethany, when our friend Lazarus died? I will never forget it. I think I’ll write it down one day.'),
  ]);
  await stage.verse(META.verseId);
  return gameStars;
}

const tomb: EraModule = {
  atmosphere: 'night',
  music: { root: 57, scale: SCALES.aeolian, bpm: 70, instrument: 'flute', drone: 0.7, drums: 'none', density: 0.3 },
  setup,
  play,
};

export default tomb;
