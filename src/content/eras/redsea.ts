import * as THREE from 'three';
import type { EraModule } from '../eraTypes';
import type { Stage } from '../../world/Stage';
import { Builder, G, roughen } from '../../world/geo';
import { Noise2D, smoothstep, lerp, rand } from '../../engine/noise';
import { SCALES, type MusicTheme } from '../../engine/Audio';
import { Ease } from '../../engine/tasks';
import { tent, rock, campfire, jar } from '../../world/props';
import { lerpColor } from '../../world/Terrain';
import { ParticleField } from '../../world/Particles';
import { makeWaterMaterial } from '../../world/Water';
import { Crowd } from '../../world/Crowd';
import { makeLabel } from '../../world/Character';
import { ATMOS } from '../../world/Sky';
import { ERA_BY_ID } from '../catalog';
import type { NPC } from '../../world/actors';
import type { Animal } from '../../world/Animal';

const META = ERA_BY_ID.redsea;
const SHORE = -12;
const FAR = 196;
const HALF = 9;

const JOY: MusicTheme = { root: 57, scale: SCALES.mixolydian, bpm: 116, instrument: 'oud', drone: 0.4, drums: 'frame', density: 0.6 };

let walls: THREE.Mesh[] = [];
let centerStrip: THREE.Mesh;
let crowd: Crowd;
let moses: NPC, aaron: NPC, miriam: NPC, mother: NPC, liora: NPC;
let lamb: Animal;
let chariots: { group: THREE.Group; wheels: THREE.Mesh[] }[] = [];
let puddles: { x: number; z: number; r: number }[] = [];
let stragglers: NPC[] = [];

function makeChariot(): { group: THREE.Group; wheels: THREE.Mesh[] } {
  const g = new THREE.Group();
  const b = new Builder();
  b.add(G.box(1.4, 0.9, 1.2), '#c9a24a', { kind: 'metal', y: 1.0 });
  b.add(G.box(0.1, 0.1, 2.6), '#6a4a2a', { y: 0.7, z: 1.6 });
  // horses
  for (const sx of [-0.45, 0.45]) {
    b.add(G.box(0.45, 0.6, 1.4), '#3a2a20', { x: sx, y: 1.3, z: 3.0 });
    b.add(G.box(0.25, 0.5, 0.6), '#3a2a20', { x: sx, y: 1.8, z: 3.7, rx: 0.5 });
    for (const lz of [2.5, 3.5]) b.add(G.cyl(0.06, 0.06, 1.0, 5), '#2a1e16', { x: sx, y: 0.5, z: lz });
  }
  b.add(G.cyl(0.2, 0.2, 0.3, 8), '#c84a2a', { x: 0, y: 1.9, z: 0.1 });
  g.add(b.build());
  const wheels: THREE.Mesh[] = [];
  for (const sx of [-0.8, 0.8]) {
    const wb = new Builder();
    wb.add(G.torus(0.5, 0.06, 5, 12), '#5a3a20', { ry: Math.PI / 2 });
    for (let i = 0; i < 6; i++) wb.add(G.box(0.04, 0.95, 0.06), '#5a3a20', { rx: (i / 6) * Math.PI });
    const w = wb.build().children[0] as THREE.Mesh;
    w.position.set(sx, 0.5, 0);
    g.add(w);
    wheels.push(w);
  }
  return { group: g, wheels };
}

const LOOKS = {
  moses: { skin: '#8d5a3b', robe: '#7a5a3a', robe2: '#5a4030', sash: '#c9a24a', hair: 'long', hairColor: '#d8d4cc', beard: 'long', beardColor: '#e2ddd4', headwear: 'keffiyeh', headwearColor: '#c9b48a', item: 'staff' },
  aaron: { skin: '#8d5a3b', robe: '#3f4f8a', sash: '#c9a24a', hair: 'short', hairColor: '#9a9690', beard: 'long', beardColor: '#bdb8b0', headwear: 'headwrap', headwearColor: '#efe6d2' },
  miriam: { skin: '#8d5a3b', robe: '#a8402e', sash: '#e0c080', hair: 'long', hairColor: '#7a7470', headwear: 'veil', headwearColor: '#e8dcc0', item: 'tambourine' },
  mother: { skin: '#9c6a45', robe: '#5a6a3a', sash: '#c9a24a', hair: 'long', headwear: 'veil', headwearColor: '#d8c8a8' },
  liora: { skin: '#9c6a45', robe: '#d8c8a8', sash: '#a8402e', hair: 'puffs', hairColor: '#1d1410', height: 0.68 },
  elder: { skin: '#8d5a3b', robe: '#8a7a6a', sash: '#5a4030', hair: 'short', hairColor: '#cfcac2', beard: 'long', beardColor: '#e2ddd4', headwear: 'headwrap', headwearColor: '#d8c8a8', item: 'staff' },
} as const;

function setup(stage: Stage): void {
  walls = [];
  chariots = [];
  puddles = [];
  stragglers = [];
  const noise = new Noise2D(23);
  const rng = stage.rng;
  const ground = (x: number, z: number) => {
    if (x > SHORE - 2 && x < FAR + 2) {
      const inSea = smoothstep(SHORE - 2, SHORE + 14, x) * (1 - smoothstep(FAR - 18, FAR + 2, x));
      const floor = -3.6 + noise.fbm(x * 0.05, z * 0.05, 3) * 0.5;
      const land = 0.6 + noise.fbm(x * 0.02, z * 0.02, 3) * 0.6;
      return lerp(land, floor, inSea);
    }
    let h = 0.6 + noise.fbm(x * 0.015, z * 0.015, 4) * 2.2;
    if (x < SHORE) h += smoothstep(48, 80, Math.abs(z)) * 32 * (1 - smoothstep(-20, 0, x)) * (0.7 + 0.3 * noise.get(x * 0.03, z * 0.03));
    if (x > FAR + 30) h += smoothstep(FAR + 30, FAR + 140, x) * 40 * (0.6 + 0.4 * noise.get(x * 0.02, z * 0.02));
    return h;
  };
  stage.terrain({
    size: 560,
    segments: 170,
    centerX: 70,
    height: ground,
    color: (x, z, y, slope) => {
      if (y < -1) return lerpColor('#8a7a5c', '#a08a68', noise.get(x * 0.2, z * 0.2) * 0.5 + 0.5);
      if (y < 0.4 && x > SHORE - 4) return '#8f7d5c';
      if (slope > 0.45) return lerpColor('#8a6248', '#a8805a', noise.get(x * 0.05, z * 0.05) * 0.5 + 0.5);
      return lerpColor('#c9a777', '#dcc095', noise.get(x * 0.03, z * 0.03) * 0.5 + 0.5);
    },
  });
  stage.bounds = { x0: -125, x1: SHORE - 1.5, z0: -55, z1: 55 };

  // Sea: north & south bodies plus the central strip that will part.
  const seaOpts = { deep: '#071f33', shallow: '#21607a', amp: 0.35, foam: 0.3 };
  const seaLen = FAR - SHORE + 30;
  const seaX = (SHORE + FAR) / 2;
  stage.water(seaLen, 300, seaX, 0.4, HALF + 150, seaOpts, 50);
  stage.water(seaLen, 300, seaX, 0.4, -HALF - 150, seaOpts, 50);
  centerStrip = stage.water(seaLen, HALF * 2, seaX, 0.4, 0, seaOpts, 40);
  for (const s of [1, -1]) {
    const mat = makeWaterMaterial({ deep: '#0a2a44', shallow: '#3c8fb0', amp: 0.25, foam: 0.55, opacity: 0.93 });
    const geo = new THREE.BoxGeometry(seaLen - 30, 17, 30, 80, 8, 4);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(seaX, -4, s * (HALF + 15));
    m.scale.y = 0.01;
    stage.scene.add(m);
    stage.waters.push(mat);
    walls.push(m);
  }

  const b = stage.statics;
  // Camp
  const campOk = (x: number, z: number) => x < SHORE - 6 && x > -85 && Math.abs(z) < 44;
  for (let i = 0; i < 34; i++) {
    const x = rand(rng, -82, -22);
    const z = rand(rng, -40, 40);
    if (!campOk(x, z) || Math.hypot(x + 16, z) < 10) continue;
    const ry = rand(rng, -0.5, 0.5) + Math.PI / 2;
    tent(b, { x, y: stage.heightAt(x, z), z, ry }, i % 3 ? '#3e3028' : '#5a4436', i % 2 ? '#d8c8a8' : '#a8402e');
    stage.addBox(x, z, 4.2, 3.8, ry);
  }
  const fires: [number, number][] = [
    [-34, 6],
    [-52, -18],
    [-60, 22],
    [-28, -26],
  ];
  fires.forEach(([x, z], i) => {
    campfire(b, { x, y: stage.heightAt(x, z), z });
    stage.addFlame(x, stage.heightAt(x, z) + 0.5, z, 1, i < 2, '#ffae50');
    stage.addCircle(x, z, 0.9);
  });
  for (let i = 0; i < 16; i++) {
    const [fx, fz] = fires[i % fires.length];
    jar(b, { x: fx + rand(rng, -4, 4), y: stage.heightAt(fx, fz), z: fz + rand(rng, -4, 4) }, i % 2 ? '#b5653a' : '#8a5a3a');
  }
  // rocks on the slopes & dunes
  for (let i = 0; i < 60; i++) {
    const x = rand(rng, -120, SHORE - 4);
    const z = rand(rng, -75, 75);
    if (campOk(x, z) && rng() < 0.7) continue;
    rock(b, { x, y: stage.heightAt(x, z) - 0.3, z, s: rand(rng, 0.8, 2.2) }, rng, '#9a7a5a');
    if (Math.abs(z) < 55) stage.addCircle(x, z, 1.2);
  }
  // Sea floor: coral, rocks, seaweed and puddles in the corridor
  for (let i = 0; i < 34; i++) {
    const x = rand(rng, 12, FAR - 14);
    const z = rand(rng, -HALF + 1.5, HALF - 1.5);
    const y = stage.heightAt(x, z);
    if (i % 3 === 0) {
      b.add(roughen(G.ico(0.9, 0), 0.3, rng), i % 2 ? '#d86a5a' : '#e09a5a', { x, y: y + 0.3, z, sy: 0.7, jitter: 0.12 });
      for (let k = 0; k < 4; k++) b.add(G.cyl(0.05, 0.12, 0.8, 5), '#e86a7a', { x: x + rand(rng, -0.5, 0.5), y: y + 0.7, z: z + rand(rng, -0.5, 0.5), rz: rand(rng, -0.5, 0.5) });
      stage.addCircle(x, z, 1.0);
    } else {
      rock(b, { x, y: y - 0.2, z, s: rand(rng, 0.7, 1.3) }, rng, '#5f5a50');
      stage.addCircle(x, z, 1.0);
    }
  }
  for (let i = 0; i < 90; i++) {
    const x = rand(rng, 0, FAR);
    const z = rand(rng, -HALF + 0.5, HALF - 0.5);
    const y = stage.heightAt(x, z);
    for (let k = 0; k < 3; k++) b.add(G.cone(0.06, rand(rng, 0.5, 1.1), 3), '#3f6a3a', { kind: 'cloth', x: x + rand(rng, -0.3, 0.3), y: y + 0.35, z: z + rand(rng, -0.3, 0.3), rz: rand(rng, -0.4, 0.4) });
    if (i % 4 === 0) b.add(G.sphere(0.12, 5, 3), '#efe2c8', { x, y: y + 0.05, z, sy: 0.4 });
  }
  for (let i = 0; i < 12; i++) {
    const x = 20 + i * 14 + rand(rng, -4, 4);
    const z = rand(rng, -5, 5);
    const r = rand(rng, 1.4, 2.4);
    puddles.push({ x, z, r });
    stage.water(r * 2, r * 2, x, stage.heightAt(x, z) + 0.06, z, { deep: '#1f4a5a', shallow: '#5aa0b0', amp: 0.02, foam: 0.05 }, 2);
  }

  // Egypt's army in the west, behind the pillar
  for (let i = 0; i < 7; i++) {
    const c = makeChariot();
    c.group.position.set(-175 + rand(rng, -6, 6), stage.heightAt(-175, -30 + i * 10), -30 + i * 10);
    c.group.rotation.y = Math.PI / 2;
    stage.scene.add(c.group);
  }
  for (let i = 0; i < 26; i++) {
    const z = -40 + i * 3.2;
    stage.addFlame(-168 + rand(rng, -5, 5), stage.heightAt(-168, z) + 2.2, z, 0.8, false, '#ffb060');
  }
  // the pillar of cloud and fire
  const px = -104;
  stage.addField(
    new ParticleField({
      count: Math.round(260 * stage.svc.quality.particles),
      color: '#ffcf8a',
      size: 3.2,
      additive: true,
      opacity: 0.55,
      spawn: (p, v) => {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 4.5;
        p.set(px + Math.cos(a) * r, Math.random() * 4, Math.sin(a) * r);
        v.set(-Math.sin(a) * 1.5, 6 + Math.random() * 6, Math.cos(a) * 1.5);
        return 5 + Math.random() * 3;
      },
    }),
  );
  stage.addField(
    new ParticleField({
      count: Math.round(140 * stage.svc.quality.particles),
      color: '#5a5068',
      size: 9,
      additive: false,
      opacity: 0.35,
      spawn: (p, v) => {
        const a = Math.random() * Math.PI * 2;
        p.set(px + Math.cos(a) * 6, 20 + Math.random() * 30, Math.sin(a) * 6);
        v.set(Math.random() - 0.5, 2, Math.random() - 0.5);
        return 6 + Math.random() * 4;
      },
    }),
  );
  for (let y = 2; y < 40; y += 5) stage.addFlame(px, y, 0, 6 - y * 0.08, y === 7, '#ffb050');
  const pillarLight = new THREE.PointLight('#ff9a4a', 40, 160, 1.2);
  pillarLight.position.set(px, 12, 0);
  stage.scene.add(pillarLight);

  // People
  crowd = new Crowd(Math.round(150 * Math.max(0.5, stage.svc.quality.particles)), rng);
  for (let i = 0; i < crowd.count; i++) {
    const [fx, fz] = fires[i % fires.length];
    const a = rng() * Math.PI * 2;
    const r = i % 3 === 0 ? rand(rng, 2.2, 4) : rand(rng, 5, 26);
    const x = Math.min(SHORE - 5, fx + Math.cos(a) * r);
    const z = Math.max(-44, Math.min(44, fz + Math.sin(a) * r));
    crowd.place(i, x, z, Math.atan2(fx - x, fz - z), i % 3 === 0);
  }
  stage.scene.add(crowd.group);
  stage.onUpdate((dt) => crowd.update(dt, (x, z) => stage.heightAt(x, z)));

  moses = stage.addNPC('Moses', { ...LOOKS.moses }, -17, 2, Math.PI / 2, '#7a5a3a');
  aaron = stage.addNPC('Aaron', { ...LOOKS.aaron }, -18, -2.5, Math.PI / 2, '#3f4f8a');
  miriam = stage.addNPC('Miriam', { ...LOOKS.miriam }, -33, 10, -Math.PI / 2, '#a8402e');
  mother = stage.addNPC('Liora’s mother', { ...LOOKS.mother }, -46, -8, 0.4, '#5a6a3a');
  liora = stage.addNPC('Liora', { ...LOOKS.liora }, -80, -46, 0.8, '#d8c8a8');
  liora.setPose('cower');
  lamb = stage.addAnimal('sheep', -78, -44, 0.55);
  lamb.mode = 'idle';
  for (let i = 0; i < 8; i++) {
    const sp = i < 4 ? 'goat' : i < 6 ? 'donkey' : 'camel';
    const x = rand(rng, -70, -30);
    const z = rand(rng, -35, 35);
    const an = stage.addAnimal(sp, x, z);
    an.wanderRadius = 5;
  }

  stage.fragment(META.fragments[0], -92, 24);
  stage.fragment(META.fragments[1], 112, 6.5);
  stage.fragment(META.fragments[2], FAR + 22, -16);

  stage.player.teleport(-40, 30, Math.PI * 0.75, stage);
}

async function play(stage: Stage): Promise<number> {
  const cam = stage.svc.cam;
  const hud = stage.svc.ui.hud;
  stage.ambient('waves', 0.45);
  stage.ambient('night', 0.4);
  stage.ambient('crowd', 0.2);

  await stage.cinematic(async () => {
    cam.cut({ x: -150, y: 14, z: 30 }, { x: -170, y: 2, z: 0 });
    await stage.narrate('When Pharaoh came near, the children of Israel lifted up their eyes, and behold, the Egyptians were marching after them; and they were very afraid.', 'Exodus 14:10');
    await cam.moveTo(stage.runner, { x: -70, y: 30, z: 60 }, { x: -20, y: 0, z: 0 }, 6);
    await stage.narrate('Mountains on either side. The sea in front. Pharaoh’s chariots behind. There was nowhere left to run.');
    await cam.moveTo(stage.runner, { x: -38, y: 3, z: 37 }, { x: -40, y: 1.6, z: 28 }, 3);
  });

  // ---- Moses
  stage.objective('Find Moses at the shore', moses);
  stage.chatter(aaron, [[stage.line(aaron, 'My brother was eighty when we first stood before Pharaoh. I was eighty-three. God doesn’t retire people!', 'Exodus 7:7')]]);
  await stage.waitTalk(moses);
  const pick = await stage.talk([
    stage.line(moses, 'Don’t be afraid. Stand still, and see the salvation of Yahweh, which he will work for you today.', 'Exodus 14:13'),
    stage.line(moses, 'Yahweh will fight for you, and you shall be still.', 'Exodus 14:14'),
    { ...stage.line(moses, 'You look worried, traveller.'), choices: ['What do we do now?', 'The army is right there!'] },
  ]);
  await stage.talk([
    pick[0] === 0
      ? stage.line(moses, 'God has told me: “Speak to the children of Israel, that they go forward.” Forward. Into the sea.', 'Exodus 14:15')
      : stage.line(moses, 'Look again. The pillar of cloud has moved behind us. To Egypt it is darkness; to us it gives light. They cannot come near us tonight.', 'Exodus 14:19–20'),
    stage.line(moses, 'But before I lift my staff: a mother is searching for her little girl. Nobody gets left behind in Egypt. Not one. Will you help?'),
  ]);
  stage.addXP(40, 'Met Moses');

  // ---- Lost child
  stage.objective('Talk to Liora’s mother', mother);
  await stage.waitTalk(mother);
  await stage.talk([
    stage.line(mother, 'My Liora! She ran after her lamb when the chariots appeared. Toward the dunes, in the south-west.'),
    stage.line(mother, 'I can’t leave the little ones alone. Please, find her!'),
  ]);
  let asked = false;
  stage.interactable(miriam, 'Talk to Miriam', async () => {
    if (asked) return void (await stage.talk([stage.line(miriam, 'Keep your eyes on the light of the pillar. When this night is over, I am going to sing. Just you wait.')]));
    asked = true;
    await stage.talk([stage.line(miriam, 'You’re the stranger everyone’s talking about. Answer me this, clever one.')]);
    await stage.quiz('Miriam', {
      q: 'What stood between Israel and Egypt’s army all night?',
      options: ['A great wall of stones', 'The pillar of cloud', 'Pharaoh’s own guards', 'A river of fire'],
      answer: 1,
      explain: 'The angel of God and the pillar of cloud moved behind Israel. It was darkness to Egypt but gave light to Israel, so neither came near the other all night.',
      ref: 'Exodus 14:19–20',
    });
  }, 3.2);

  stage.objective('Find Liora near the dunes', liora);
  await stage.waitTalk(liora);
  liora.setPose('idle');
  await stage.talk([
    stage.line(liora, 'I couldn’t leave Pebble behind! He’s scared of the dark… and of the horses.'),
    { ...stage.line(liora, 'Will you take us back to Mama?'), choices: ['Of course. Stay close to me.', 'Race you there!'] },
  ]);
  liora.followTarget = stage.player.char.root;
  liora.followDist = 1.8;
  liora.followSpeed = 5;
  lamb.mode = 'follow';
  lamb.followTarget = liora.char.root;
  lamb.followDist = 1.2;
  stage.objective('Bring Liora back to her mother', mother);
  await stage.waitUntil(() => liora.position.distanceTo(mother.position) < 5);
  liora.followTarget = null;
  void liora.walkTo(stage.runner, mother.position.x + 1, mother.position.z + 0.5, 3).catch(() => undefined);
  await stage.talk([
    stage.line(mother, 'Liora! Oh, thank God. Thank you, stranger, thank you!'),
    stage.line(liora, 'Pebble says thank you too.'),
  ]);
  stage.addXP(60, 'Found Liora');

  // ---- Parting the sea
  stage.objective('Return to Moses at the shore', moses);
  await stage.waitTalk(moses);
  await stage.talk([stage.line(moses, 'Thank you. Now, stand still and watch what God will do.')]);
  await stage.cinematic(async () => {
    moses.place(-14, 0, Math.PI / 2, stage);
    moses.setPose('raise');
    cam.cut({ x: -24, y: 3, z: 8 }, { x: -10, y: 3, z: 0 });
    await stage.narrate('Moses stretched out his hand over the sea, and Yahweh caused the sea to go back by a strong east wind all night…', 'Exodus 14:21');
    stage.ambient('wind', 0.9, 2);
    stage.sfx('rumble');
    const spray = stage.addField(
      new ParticleField({
        count: Math.round(300 * stage.svc.quality.particles),
        color: '#cfe8ff',
        size: 0.5,
        additive: true,
        opacity: 0.7,
        spawn: (p, v) => {
          p.set(rand(Math.random, SHORE, FAR), rand(Math.random, 0, 14), (Math.random() < 0.5 ? 1 : -1) * rand(Math.random, HALF, HALF + 3));
          v.set(-14 - Math.random() * 8, Math.random() * 2, 0);
          return 2 + Math.random() * 2;
        },
      }),
    );
    void spray;
    await cam.moveTo(stage.runner, { x: -30, y: 22, z: 30 }, { x: 40, y: 0, z: 0 }, 3);
    if (!stage.svc.getSave().settings.reduceMotion) cam.shake(0.25, 6);
    await stage.tween(7, (t) => {
      for (const w of walls) w.scale.y = Math.max(0.01, t);
      for (const w of walls) w.position.y = -4 + 8.5 * t;
      centerStrip.position.y = lerp(0.4, -7, Math.min(1, t * 1.4));
    }, Ease.inOut);
    centerStrip.visible = false;
    await stage.narrate('…and made the sea dry land, and the waters were divided. The waters were a wall to them on their right hand, and on their left.', 'Exodus 14:21–22');
    await cam.moveTo(stage.runner, { x: -18, y: 2.5, z: 0 }, { x: 30, y: 1, z: 0 }, 3);
  });
  moses.setPose('idle');
  stage.ambient('wind', 0.5, 3);

  // ---- The crossing (runner): moonlight so the sea bed is readable
  void stage.setAtmosphere({ ...ATMOS.night, hemiSky: '#7a94d0', hemiGround: '#3a3a4a', hemiIntensity: 1.25, sunIntensity: 0.9 }, 2);
  stage.bounds = { x0: -20, x1: FAR + 40, z0: -60, z1: 60 };
  stage.addBox((SHORE + FAR) / 2, HALF + 16, FAR - SHORE + 10, 32);
  stage.addBox((SHORE + FAR) / 2, -HALF - 16, FAR - SHORE + 10, 32);
  stage.player.teleport(-10, 0, Math.PI / 2, stage);
  cam.yaw = -Math.PI / 2;
  cam.lockYaw = true;
  cam.pitch = 0.28;
  cam.distance = 6.5;
  stage.music({ root: 52, scale: SCALES.hijaz, bpm: 120, instrument: 'oud', drone: 0.6, drums: 'march', density: 0.55 });
  for (let i = 0; i < crowd.count; i++) {
    crowd.place(i, rand(stage.rng, -6, 50), rand(stage.rng, -HALF + 1, HALF - 1), Math.PI / 2, false);
    crowd.walkTo(i, FAR + 10 + rand(stage.rng, 0, 25), rand(stage.rng, -25, 25), rand(stage.rng, 3.4, 4.6));
  }
  for (const n of [moses, aaron, miriam, mother, liora]) n.char.root.visible = false;
  lamb.root.visible = false;
  const spots = [26, 48, 70, 94, 118, 142, 166];
  spots.forEach((x, i) => {
    const s = stage.addNPC(i % 3 === 2 ? 'A tired child' : 'An elderly traveller', i % 3 === 2 ? { ...LOOKS.liora, robe: '#a8805a', hair: 'short' } : { ...LOOKS.elder }, x, rand(stage.rng, -5, 5), Math.PI / 2);
    s.showTag = false;
    s.data = { helped: false };
    const sign = makeLabel('✋ Help!', { size: 0.42, color: '#ffe39a', bg: 'rgba(122,92,255,0.8)' });
    sign.position.y = 2.25;
    s.char.root.add(sign);
    s.data.sign = sign;
    void s.walkTo(stage.runner, FAR + 15, rand(stage.rng, -15, 15), 0.7).catch(() => undefined);
    stragglers.push(s);
  });
  const TOTAL = 80;
  let t = 0;
  let helped = 0;
  let cutDone = false;
  await stage.narrate('Run! Cross before the morning watch. Help anyone who is struggling on the way.', undefined, 1.5);
  stage.objective('Cross the sea to the far shore', new THREE.Vector3(FAR + 6, 0, 0), `Helped 0/${stragglers.length}`);
  const sparkle = stage.addField(
    new ParticleField({ count: 40, color: '#ffe39a', size: 0.3, spawn: (p, v) => { p.set(0, -50, 0); v.set(0, 0, 0); return 1; } }),
  );
  sparkle.emitting = false;
  const stop = stage.onUpdate((dt) => {
    if (!stage.svc.ui.busy && stage.svc.cam.mode === 'follow') t += dt;
    const left = Math.max(0, TOTAL - t);
    const prog = Math.max(0, Math.min(1, (stage.player.position.x + 10) / (FAR + 10)));
    hud.setMeter('dawn', `Before the morning watch: ${Math.ceil(left)}s`, left / TOTAL, left > 20 ? '#7ab8ff' : '#ff7a6b');
    hud.setMeter('prog', `Across the sea: ${Math.round(prog * 100)}%`, prog, '#f3c86a');
    const p = stage.player.position;
    let slow = 1;
    for (const pd of puddles) if (Math.hypot(p.x - pd.x, p.z - pd.z) < pd.r) slow = 0.55;
    if (slow < 1 && stage.player.speedMul === 1) stage.sfx('splash', 0.4);
    stage.player.speedMul = slow;
    for (const s of stragglers) {
      if (s.data.helped) continue;
      if (s.position.distanceTo(p) < 3.2) {
        s.data.helped = true;
        (s.data.sign as THREE.Sprite).visible = false;
        helped++;
        s.stop();
        void s.walkTo(stage.runner, FAR + 15, rand(Math.random, -15, 15), 3.4).catch(() => undefined);
        s.setPose('idle');
        stage.sfx('chime', 0.7);
        stage.toast('You helped them along! +20 XP', 'good');
        stage.addXP(20);
        stage.count(`Helped ${helped}/${stragglers.length}`);
      }
    }
  });
  // chariot cut-in at the half-way point
  void (async () => {
    await stage.waitUntil(() => stage.player.position.x > 92);
    if (cutDone) return;
    cutDone = true;
    await stage.cinematic(async () => {
      for (let i = 0; i < 3; i++) {
        const c = makeChariot();
        c.group.position.set(4 + i * 7, stage.heightAt(4 + i * 7, 0), (i - 1) * 3);
        c.group.rotation.y = Math.PI / 2;
        stage.scene.add(c.group);
        chariots.push(c);
      }
      cam.cut({ x: 40, y: 4, z: 6 }, { x: 8, y: 1, z: 0 });
      stage.sfx('rumble', 0.7);
      void stage.tween(3, (k) => {
        chariots.forEach((c, i) => {
          c.group.position.x = 4 + i * 7 + k * 6;
          c.wheels.forEach((w, j) => {
            w.position.y = 0.5 + Math.sin(k * Math.PI) * (j ? 1.6 : 1.2);
            w.position.x = (j ? 0.8 : -0.8) + (j ? 1 : -1) * k * 4;
            w.rotation.x += 0.3;
          });
          c.group.rotation.z = k * 0.25 * (i % 2 ? 1 : -1);
        });
      });
      await stage.narrate('He took off their chariot wheels, and they drove them heavily. The Egyptians said, “Let’s flee from the face of Israel, for Yahweh fights for them!”', 'Exodus 14:25');
    });
    cam.yaw = -Math.PI / 2;
    cam.lockYaw = true;
  })().catch(() => undefined);

  await stage.waitUntil(() => stage.player.position.x > FAR - 2);
  stop();
  hud.clearMeters();
  cam.lockYaw = false;
  cam.distance = 7.5;
  stage.player.speedMul = 1;
  const gameStars = helped >= 6 && t <= 65 ? 3 : helped >= 3 || t <= 75 ? 2 : 1;
  stage.addXP(Math.max(0, Math.round((TOTAL - t) * 2)), 'Crossing time');
  stage.objective(null);

  // ---- Dawn on the far shore
  await stage.cinematic(async () => {
    void stage.setAtmosphere('dawn', 4);
    stage.music(JOY);
    for (const [n, x, z] of [
      [moses, FAR + 6, 4],
      [aaron, FAR + 7, 7],
      [miriam, FAR + 14, -6],
      [mother, FAR + 16, 10],
      [liora, FAR + 15, 11],
    ] as [NPC, number, number][]) {
      n.char.root.visible = true;
      n.place(x, z, -Math.PI / 2, stage);
    }
    lamb.root.visible = true;
    lamb.position.set(FAR + 15, stage.heightAt(FAR + 15, 12.5), 12.5);
    lamb.mode = 'idle';
    for (let i = 0; i < crowd.count; i++) {
      crowd.place(i, FAR + 8 + rand(stage.rng, 0, 30), rand(stage.rng, -28, 28), -Math.PI / 2, false);
    }
    for (const s of stragglers) s.char.root.visible = false;
    stage.player.teleport(FAR + 4, -2, -Math.PI / 2, stage);
    moses.setPose('raise');
    cam.cut({ x: FAR + 14, y: 5, z: 14 }, { x: FAR - 30, y: 3, z: 0 });
    await stage.narrate('In the morning, Moses stretched out his hand over the sea again…', 'Exodus 14:27');
    stage.sfx('rumble');
    stage.sfx('splash');
    if (!stage.svc.getSave().settings.reduceMotion) cam.shake(0.3, 3);
    centerStrip.visible = true;
    await stage.tween(4, (k) => {
      for (const w of walls) {
        w.scale.y = Math.max(0.01, 1 - k);
        w.position.y = -4 + 8.5 * (1 - k);
      }
      centerStrip.position.y = lerp(-7, 0.4, k);
    }, Ease.inOut);
    stage.ambient('wind', 0.2);
    await stage.narrate('…and the sea returned to its strength. Israel saw the great work which Yahweh did, and the people feared Yahweh; and they believed in Yahweh and in his servant Moses.', 'Exodus 14:27, 31');
    moses.setPose('idle');
    miriam.setPose('cheer');
    for (const p of crowd.people) p.cheer = Math.random() < 0.6;
    stage.sfx('cheer');
    cam.cut({ x: FAR + 30, y: 3, z: -14 }, { x: FAR + 14, y: 1.8, z: -6 });
    await stage.narrate('Miriam the prophetess took a tambourine in her hand; and all the women went out after her with tambourines and with dances.', 'Exodus 15:20');
  });
  await stage.talk([
    stage.line(miriam, 'Sing to Yahweh, for he has triumphed gloriously!', 'Exodus 15:21'),
    stage.line(moses, 'Remember what you saw tonight, traveller. When you are trapped and afraid, remember the words God gave us on the shore.'),
  ]);
  await stage.verse(META.verseId);
  return gameStars;
}

const redsea: EraModule = {
  atmosphere: 'night',
  music: { root: 52, scale: SCALES.hijaz, bpm: 92, instrument: 'oud', drone: 0.7, drums: 'frame', density: 0.45 },
  setup,
  play,
};

export default redsea;
