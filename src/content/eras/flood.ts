import * as THREE from 'three';
import type { EraModule } from '../eraTypes';
import type { Stage } from '../../world/Stage';
import { Builder, G } from '../../world/geo';
import { Noise2D, smoothstep, lerp, rand } from '../../engine/noise';
import { SCALES } from '../../engine/Audio';
import { Ease } from '../../engine/tasks';
import { leafyTree, cypress, rock, bush, grass, flowers, tent, campfire, jar, makeRainbow } from '../../world/props';
import { lerpColor } from '../../world/Terrain';
import { ERA_BY_ID } from '../catalog';
import type { Animal, Species } from '../../world/Animal';
import type { NPC } from '../../world/actors';

const META = ERA_BY_ID.flood;
const ARK = { x: 0, z: -28, len: 82, wid: 14, base: 1.0, sill: 3.2 };
const RAMP = { x0: -3, x1: 3, zTop: -21, zBottom: -15.5 };
const DOOR_LEN = 6.2;
const DOOR_OPEN = 0.47;

let rampOpen = true;
let ark: THREE.Group;
let door: THREE.Group;
let floodWater: THREE.Mesh;
let noah: NPC, shem: NPC, ham: NPC, japheth: NPC, wife: NPC;
const animals: Animal[] = [];

function makeArk(): { group: THREE.Group; door: THREE.Group } {
  const b = new Builder();
  const { len, wid } = ARK;
  const H = 8.4;
  const shape = new THREE.Shape();
  shape.moveTo(-wid / 2, H);
  shape.lineTo(wid / 2, H);
  shape.lineTo(wid / 2, H * 0.38);
  shape.lineTo(wid * 0.3, 0);
  shape.lineTo(-wid * 0.3, 0);
  shape.lineTo(-wid / 2, H * 0.38);
  shape.closePath();
  const hull = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
  hull.translate(0, 0, -len / 2);
  hull.rotateY(Math.PI / 2);
  b.add(hull, '#7a5634', { jitter: 0.06 });
  // planking stripes and ribs
  for (let i = 0; i < 6; i++) {
    for (const s of [1, -1]) b.add(G.box(len + 0.2, 0.12, 0.12), i % 2 ? '#5e4026' : '#6a4a2c', { y: 3.6 + i * 0.85, z: (s * wid) / 2 + s * 0.05 });
  }
  for (let x = -len / 2 + 3; x < len / 2; x += 6) {
    for (const s of [1, -1]) b.add(G.box(0.35, H * 0.62, 0.2), '#4f3520', { x, y: H * 0.69, z: (s * wid) / 2 + s * 0.08 });
  }
  // pitch line along the bottom
  for (const s of [1, -1]) b.add(G.box(len, 0.6, 0.15), '#2a1e16', { y: 3.0, z: (s * wid) / 2 + s * 0.04 });
  // deck house roof with a cubit-high opening
  b.add(G.box(len - 6, 2.2, wid - 3), '#6e4c2e', { y: H + 1.1 });
  b.add(G.box(len - 6.5, 0.5, wid - 3.4), '#1e140e', { y: H + 2.45 });
  const roof = new THREE.CylinderGeometry(wid * 0.62, wid * 0.62, len - 4, 3, 1);
  b.add(roof, '#5a3c22', { y: H + 3.6, rz: Math.PI / 2, sy: 1, sz: 0.55, sx: 0.32, rx: Math.PI / 6 });
  // support blocks
  for (let x = -len / 2 + 6; x < len / 2 - 4; x += 10) b.add(G.box(3, 1.2, wid * 0.55), '#6b5a48', { x, y: -0.4 });
  const group = b.build();
  group.position.set(ARK.x, ARK.base, ARK.z);
  // door doubles as the ramp (hinged at the sill)
  const db = new Builder();
  db.add(G.box(6, 0.3, DOOR_LEN), '#6a4a2c', { z: DOOR_LEN / 2 });
  for (let i = 0; i < 8; i++) db.add(G.box(5.6, 0.12, 0.18), '#4f3520', { y: 0.2, z: 0.5 + i * 0.72 });
  const doorG = new THREE.Group();
  doorG.add(db.build());
  doorG.position.set(0, ARK.sill - ARK.base, wid / 2);
  doorG.rotation.x = DOOR_OPEN;
  group.add(doorG);
  // dark doorway
  const hole = new Builder();
  hole.add(G.box(6, 4.6, 0.3), '#120c08', { y: ARK.sill - ARK.base + 2.3, z: wid / 2 - 0.05 });
  group.add(hole.build({ shadows: false }));
  return { group, door: doorG };
}

const NPC_LOOKS = {
  noah: { skin: '#a8744e', robe: '#d9cbb0', robe2: '#bfa77f', sash: '#7a4a2a', hair: 'long', hairColor: '#e8e4dc', beard: 'long', beardColor: '#efece6', headwear: 'keffiyeh', headwearColor: '#e8dcc0', item: 'staff' },
  shem: { skin: '#9c6a45', robe: '#7a5a3a', sash: '#c9a24a', hair: 'short', hairColor: '#2a1a12', beard: 'short', headwear: 'headwrap', headwearColor: '#c9b48a' },
  ham: { skin: '#6b4428', robe: '#a8402e', sash: '#e0c080', hair: 'short', hairColor: '#1a120c', beard: 'short' },
  japheth: { skin: '#c99470', robe: '#3f6a8a', sash: '#d8c8a8', hair: 'short', hairColor: '#4a2a1a', beard: 'short' },
  wife: { skin: '#a8744e', robe: '#6a3a5a', sash: '#d8b86a', hair: 'long', hairColor: '#6a6460', headwear: 'veil', headwearColor: '#e8dcc0' },
} as const;

function setup(stage: Stage): void {
  rampOpen = true;
  animals.length = 0;
  const noise = new Noise2D(11);
  const rng = stage.rng;
  const nearArk = (x: number, z: number) => {
    const dx = Math.max(0, Math.abs(x - ARK.x) - 48);
    const dz = Math.max(0, Math.abs(z - ARK.z) - 16);
    return Math.hypot(dx, dz);
  };
  const baseH = (x: number, z: number) => {
    const r = Math.hypot(x, z + 20);
    let h = noise.fbm(x * 0.012, z * 0.012, 4) * 5 + 1.5;
    h += smoothstep(80, 125, r) * 26 * (0.6 + 0.4 * noise.get(x * 0.02, z * 0.02));
    h += Math.max(0, noise.fbm(x * 0.05 + 7, z * 0.05, 2)) * 2;
    const flat = 1 - smoothstep(0, 18, nearArk(x, z));
    return lerp(h, 0.4, flat);
  };
  stage.terrain({
    size: 300,
    segments: 120,
    centerZ: -20,
    height: (x, z) => baseH(x, z),
    color: (x, z, y, slope) => {
      if (slope > 0.45) return lerpColor('#7a7064', '#958a7a', noise.get(x * 0.1, z * 0.1) * 0.5 + 0.5);
      if (y > 16) return lerpColor('#7c8c58', '#a3a08a', (y - 16) / 10);
      const g = noise.get(x * 0.04, z * 0.04) * 0.5 + 0.5;
      if (nearArk(x, z) < 4) return lerpColor('#8a7a52', '#7c8a4a', g);
      return lerpColor('#5d9a44', '#86b85a', g);
    },
  });
  stage.heightFn = (x, z) => {
    if (rampOpen && x > RAMP.x0 - 0.3 && x < RAMP.x1 + 0.3 && z < RAMP.zBottom && z > RAMP.zTop - 0.6) {
      const t = (RAMP.zBottom - z) / (RAMP.zBottom - RAMP.zTop);
      return lerp(baseH(x, z), ARK.sill, Math.min(1, t));
    }
    return baseH(x, z);
  };
  stage.bounds = { x0: -125, x1: 125, z0: -150, z1: 100 };

  // Ark
  const a = makeArk();
  ark = a.group;
  door = a.door;
  stage.scene.add(ark);
  ark.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  stage.addBox(ARK.x, ARK.z, ARK.len, ARK.wid);

  const b = stage.statics;
  // scaffolding at the stern
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) b.add(G.cyl(0.12, 0.12, 9, 5), '#6a4a2a', { x: 36 + i * 2, y: 4.5, z: -20 + j * -7 });
    b.add(G.box(8, 0.2, 1.2), '#7a5a3a', { x: 39, y: 2.5 + i * 2, z: -20 });
  }
  // timber stacks & pitch barrels
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < 5; i++) b.add(G.cyl(0.3, 0.3, 7, 6), '#8a6a42', { x: 22 + (i % 3) * 0.62 + k * 6, y: 0.6 + Math.floor(i / 3) * 0.55, z: -6, rz: Math.PI / 2, ry: Math.PI / 2 });
    stage.addBox(23 + k * 6, -6, 2.2, 7.2);
  }
  for (let i = 0; i < 6; i++) {
    const x = -30 + i * 1.4;
    b.add(G.cyl(0.5, 0.5, 1.1, 10), '#2a1e16', { x, y: 0.95, z: -8 });
    b.add(G.torus(0.5, 0.05, 4, 10), '#5a4030', { x, y: 1.1, z: -8, rx: Math.PI / 2 });
  }
  stage.addBox(-26.5, -8, 9, 1.4);
  // family camp
  const camp = [
    [-22, 4, 0.3],
    [-12, 10, -0.2],
    [-30, 14, 0.5],
  ];
  camp.forEach(([x, z, ry], i) => {
    tent(b, { x, y: stage.heightAt(x, z), z, ry }, i % 2 ? '#5a4436' : '#3e3028');
    stage.addBox(x, z, 4.4, 3.6, ry);
  });
  campfire(b, { x: -18, y: stage.heightAt(-18, 16), z: 16 });
  stage.addFlame(-18, stage.heightAt(-18, 16) + 0.5, 16, 0.9, true);
  stage.addCircle(-18, 16, 0.9);
  for (let i = 0; i < 8; i++) jar(b, { x: -6 + (i % 4) * 0.7, y: stage.heightAt(-6, 2), z: 2 + Math.floor(i / 4) * 0.7 }, i % 2 ? '#b5653a' : '#c98a52');
  for (let i = 0; i < 5; i++) b.add(G.cyl(0.4, 0.3, 0.45, 9), '#b08850', { x: -3 + i * 0.95, y: stage.heightAt(-3, 0) + 0.22, z: -0.5 });

  // Nature
  const clear = (x: number, z: number) => nearArk(x, z) > 10 && Math.hypot(x + 20, z - 10) > 16;
  for (let i = 0; i < 90; i++) {
    const ang = rng() * Math.PI * 2;
    const r = rand(rng, 62, 110);
    const x = Math.sin(ang) * r;
    const z = -20 + Math.cos(ang) * r;
    if (!clear(x, z)) continue;
    const y = stage.heightAt(x, z);
    if (rng() < 0.45) cypress(b, { x, y, z }, rng);
    else leafyTree(b, { x, y, z, s: rand(rng, 0.9, 1.3) }, rng, rng() < 0.5 ? '#4f8f3a' : '#5c9c42');
    stage.addCircle(x, z, 0.7);
  }
  // groves on the plain
  for (const [cx, cz] of [
    [-55, -10],
    [50, 25],
    [-40, 45],
    [60, -50],
  ]) {
    for (let i = 0; i < 7; i++) {
      const x = cx + rand(rng, -9, 9);
      const z = cz + rand(rng, -9, 9);
      leafyTree(b, { x, y: stage.heightAt(x, z), z }, rng);
      stage.addCircle(x, z, 0.7);
    }
  }
  for (let i = 0; i < 70; i++) {
    const x = rand(rng, -110, 110);
    const z = rand(rng, -130, 80);
    if (!clear(x, z)) continue;
    if (rng() < 0.4) {
      rock(b, { x, y: stage.heightAt(x, z) - 0.2, z, s: rand(rng, 0.6, 1.8) }, rng);
      stage.addCircle(x, z, 0.9);
    } else bush(b, { x, y: stage.heightAt(x, z), z }, rng);
  }
  grass(b, Math.round(1400 * stage.svc.quality.particles), { x0: -100, x1: 100, z0: -110, z1: 70 }, (x, z) => stage.heightAt(x, z), clear, rng);
  flowers(b, Math.round(500 * stage.svc.quality.particles), { x0: -90, x1: 90, z0: -100, z1: 70 }, (x, z) => stage.heightAt(x, z), clear, rng);
  // a pond in the west
  stage.water(22, 16, -70, stage.heightAt(-70, 20) + 0.15, 20, { deep: '#2c5d6e', shallow: '#6fb7b8', amp: 0.04, foam: 0.1 }, 8);

  // Flood water (hidden until the rain)
  floodWater = stage.water(600, 600, 0, -6, -20, { deep: '#1d3c4f', shallow: '#4f7f8f', amp: 0.6, foam: 0.5, opacity: 0.95 }, 60);
  floodWater.visible = false;

  // People
  noah = stage.addNPC('Noah', { ...NPC_LOOKS.noah }, 6, -11, 0.2, '#8a7a5a');
  shem = stage.addNPC('Shem', { ...NPC_LOOKS.shem }, -4.5, -11, 0.3, '#7a5a3a');
  ham = stage.addNPC('Ham', { ...NPC_LOOKS.ham }, 20, -3, -0.6, '#a8402e');
  japheth = stage.addNPC('Japheth', { ...NPC_LOOKS.japheth }, -14, 6, 2.6, '#3f6a8a');
  wife = stage.addNPC('Noah’s wife', { ...NPC_LOOKS.wife }, -2, 2.5, 3.1, '#6a3a5a');
  ham.setPose('carry');
  ham.char.attachItem('basket');

  // Animals in pairs, scattered across the plain
  const spots: [Species, number, number, number, number][] = [
    ['sheep', -38, 22, -48, 30],
    ['camel', 42, 8, 55, -6],
    ['elephant', 30, 40, 46, 52],
    ['giraffe', -50, -30, -62, -14],
    ['lion', 62, -26, 48, -40],
    ['deer', -28, 50, -14, 62],
  ];
  for (const [sp, x1, z1, x2, z2] of spots) {
    for (const [x, z] of [
      [x1, z1],
      [x2, z2],
    ]) {
      const an = stage.addAnimal(sp, x, z, sp === 'elephant' ? 0.9 : 1);
      an.wanderRadius = 6;
      an.data.species = sp;
      animals.push(an);
    }
  }
  // birds overhead
  for (let i = 0; i < 6; i++) {
    const r = 20 + i * 6;
    const h = 18 + i * 2;
    const sp = 0.25 + i * 0.03;
    stage.addBird((t) => new THREE.Vector3(Math.sin(t * sp + i) * r, h + Math.sin(t * 0.7 + i) * 2, -20 + Math.cos(t * sp + i) * r), i % 2 ? '#f6f4ee' : '#8a8a92', 1.4);
  }

  // Fragments
  stage.fragment(META.fragments[0], 40, -12);
  stage.fragment(META.fragments[1], 78, 30);
  stage.fragment(META.fragments[2], -78, 14);

  stage.player.teleport(4, 30, Math.PI, stage);
}

async function play(stage: Stage): Promise<number> {
  const cam = stage.svc.cam;
  const hud = stage.svc.ui.hud;
  stage.ambient('wind', 0.25);

  // Opening
  await stage.cinematic(async () => {
    cam.cut({ x: 90, y: 40, z: 40 }, { x: 0, y: 5, z: -28 });
    await stage.narrate('The earth was corrupt before God, and the earth was filled with violence.', 'Genesis 6:11');
    await cam.moveTo(stage.runner, { x: 30, y: 12, z: 18 }, { x: 0, y: 6, z: -28 }, 5, Ease.inOut);
    await stage.narrate('But Noah found favor in Yahweh’s eyes. And Noah did all that God commanded him.', 'Genesis 6:8, 22');
    await cam.moveTo(stage.runner, { x: 4, y: 3.2, z: 37 }, { x: 4, y: 1.6, z: 28 }, 2.5);
  });

  stage.objective('Talk to Noah by the ark', noah);
  stage.chatter(ham, [
    [stage.line(ham, 'Pitch, inside and out! That’s what God said. My hands will be black for a year.'), stage.line(ham, 'Mother says we’ve gathered enough food for every creature. Every one!', 'Genesis 6:21')],
  ]);
  stage.chatter(wife, [
    [stage.line(wife, 'The neighbours think we’re mad. A ship, on dry land, far from any sea.'), stage.line(wife, 'But my husband walks with God. I’ve seen him trust God when nobody else did.', 'Genesis 6:9')],
  ]);
  await stage.waitTalk(noah);
  const picks = await stage.talk([
    stage.line(noah, 'Peace to you, stranger! You’ve come at an unusual time. Most folk only come to laugh at the old man building a ship.'),
    stage.line(noah, 'God told me: “Make a ship of gopher wood. You shall make rooms in the ship, and shall seal it inside and outside with pitch.”', 'Genesis 6:14'),
    { ...stage.line(noah, 'Ask me anything. Our work is nearly done.'), choices: ['How long did it take to build?', 'Why did God choose you?'] },
  ]);
  await stage.talk([
    picks[0] === 0
      ? stage.line(noah, 'Many years. My sons Shem, Ham and Japheth grew up with sawdust in their hair!')
      : stage.line(noah, 'Not because I’m perfect, friend. I found favour in God’s eyes and I walked with him. When he spoke, I simply did what he said.', 'Genesis 6:8–9'),
    stage.line(noah, 'And God said the animals would come: “two of every sort will come to you, to keep them alive.”', 'Genesis 6:20'),
    stage.line(noah, 'They are coming, but this darkening sky has spooked them. They’re scattered all over the plain. Help Shem guide them to the door, two by two!'),
  ]);
  stage.addXP(50, 'Met Noah');

  stage.objective('Talk to Shem at the ramp', shem);
  await stage.waitTalk(shem);
  await stage.talk([
    stage.line(shem, 'You’re helping? Wonderful! Here’s how: walk up to an animal and press the Talk button to lead it.'),
    stage.line(shem, 'You can guide two at a time. Bring them right up to this ramp and they’ll go in. Match a pair for a bonus!'),
    stage.line(shem, 'But hurry. Look at those clouds. When the rain starts, it won’t stop.'),
  ]);

  // ---- Mini-game: guide the animals
  const TOTAL = 160;
  let left = TOTAL;
  let aboard = 0;
  let byPlayer = 0;
  const followers: Animal[] = [];
  const rampFoot = new THREE.Vector3(0, 0, RAMP.zBottom + 1.5);
  const inside = new THREE.Vector3(0, 0, -25);
  const boardedSpecies = new Map<string, number>();
  stage.objective('Guide the animals to the ark', null, `0/${animals.length}`);
  stage.setTarget(() => (followers.length ? rampFoot : nearestFree()?.position ?? rampFoot));
  const nearestFree = () => {
    let best: Animal | null = null;
    let bd = Infinity;
    for (const an of animals) {
      if (an.data.state) continue;
      const d = an.position.distanceTo(stage.player.position);
      if (d < bd) {
        bd = d;
        best = an;
      }
    }
    return best;
  };
  const removers: (() => void)[] = [];
  for (const an of animals) {
    removers.push(
      stage.interactable(
        an.root,
        `Lead the ${an.species}`,
        () => {
          if (followers.length >= 2) {
            stage.toast('You can only lead two at a time. Bring these to the ramp first!', 'warn');
            return;
          }
          an.data.state = 'following';
          an.mode = 'follow';
          an.followTarget = followers.length ? followers[followers.length - 1].root : stage.player.char.root;
          an.followDist = followers.length ? 2.6 : 2.4;
          followers.push(an);
          stage.sfx(an.species === 'lion' ? 'roar' : 'bleat', an.species === 'lion' ? 0.4 : 0.8);
          stage.toast(`The ${an.species} is following you`, 'good');
        },
        3.4,
        () => !an.data.state,
      ),
    );
  }
  let thunderAt = 0;
  const stop = stage.onUpdate((dt) => {
    if (!stage.svc.ui.busy) left -= dt;
    hud.setMeter('storm', left > 0 ? `Before the rain: ${Math.ceil(left)}s` : 'The rain has begun!', left / TOTAL, left > 40 ? '#f3c86a' : '#ff7a6b');
    const storm = 1 - left / TOTAL;
    stage.rain.intensity = Math.max(0, (storm - 0.82) * 4);
    if (storm > 0.55) {
      thunderAt -= dt;
      if (thunderAt <= 0) {
        thunderAt = 9 + Math.random() * 8;
        stage.sfx('thunder', 0.5 + storm * 0.5);
        if (!stage.svc.getSave().settings.reduceMotion) cam.shake(0.08, 0.6);
      }
    }
    for (const an of animals) {
      if (an.data.state === 'following' && an.position.distanceTo(rampFoot) < 7) {
        an.data.state = 'boarding';
        an.mode = 'goto';
        an.gotoTarget.copy(inside);
        followers.splice(followers.indexOf(an), 1);
        for (const f of followers) if (f.followTarget === an.root) f.followTarget = stage.player.char.root;
        byPlayer++;
        const sp = an.species;
        const n = (boardedSpecies.get(sp) ?? 0) + 1;
        boardedSpecies.set(sp, n);
        if (n === 2) {
          stage.addXP(40, `Pair of ${sp}s aboard`);
          stage.sfx('success');
        } else stage.sfx('chime', 0.6);
      }
      if (an.data.state === 'boarding' && an.position.z < -22.3) {
        an.data.state = 'aboard';
        an.root.visible = false;
        aboard++;
        stage.count(`${aboard}/${animals.length}`);
      }
    }
  });
  // atmosphere slowly darkens
  void stage.setAtmosphere('storm', TOTAL * 0.95).catch(() => undefined);
  stage.ambient('wind', 0.5, 30);

  // Japheth's optional question
  let asked = false;
  const rmQ = stage.interactable(japheth, 'Talk to Japheth', async () => {
    if (asked) {
      await stage.talk([stage.line(japheth, 'Keep going! I can hear thunder over the hills.')]);
      return;
    }
    asked = true;
    await stage.talk([stage.line(japheth, 'Quick, before you go back out: I bet you don’t know this one!')]);
    await stage.quiz('Japheth', {
      q: 'How did God say the animals would come to the ark?',
      options: ['Noah would have to hunt and trap them', 'Two of every sort would come to Noah', 'Noah’s sons would buy them at market', 'Only the birds would come'],
      answer: 1,
      explain: 'God told Noah, “two of every sort will come to you, to keep them alive.” Later they “went by pairs to Noah into the ship.”',
      ref: 'Genesis 6:20; 7:9',
    });
  }, 3.2);

  await stage.waitUntil(() => aboard >= animals.length || left <= 0);
  const timedOut = aboard < animals.length;
  if (timedOut) {
    stage.rain.intensity = 0.6;
    stage.ambient('rain', 0.5);
    await stage.talk([
      stage.line(noah, 'The first drops are falling! But look, the rest are coming on their own, just as God said they would.'),
    ]);
    for (const an of animals) {
      if (an.data.state === 'aboard') continue;
      an.data.state = 'boarding';
      an.mode = 'goto';
      an.gotoTarget.copy(rampFoot);
      an.spec.speed = 7;
    }
    await stage.waitUntil(() => animals.every((an) => an.data.state !== 'boarding' || an.position.distanceTo(rampFoot) < 1.5));
    for (const an of animals) {
      an.root.visible = false;
      an.data.state = 'aboard';
    }
  }
  stop();
  rmQ();
  removers.forEach((r) => r());
  hud.setMeter('storm', null);
  stage.objective(null);
  const gameStars = byPlayer >= 12 ? 3 : byPlayer >= 8 ? 2 : 1;
  stage.addXP(byPlayer * 10, 'Animals guided');

  // ---- Into the ark
  await stage.talk([
    stage.line(noah, 'That’s every one of them. Thank you, friend.'),
    stage.line(noah, 'Now God says to me: “Come with all of your household into the ship.”', 'Genesis 7:1'),
    stage.line(noah, 'You cannot come with us, traveller. This was never your story to change. But stay and watch what God does.'),
  ]);
  stage.rain.intensity = 0.5;
  stage.ambient('rain', 0.6);
  await stage.cinematic(async () => {
    cam.cut({ x: 16, y: 6, z: 2 }, { x: 0, y: 3, z: -18 });
    const family = [noah, wife, shem, ham, japheth];
    family.forEach((n, i) => {
      n.stop();
      n.setPose('idle');
      n.followTarget = null;
      void n.walkPath(stage.runner, [[i * 0.6 - 1.2, -12], [0, -19.5], [0, -24]], 2.4).catch(() => undefined);
    });
    await stage.wait(5.5);
    family.forEach((n) => (n.char.root.visible = false));
    await stage.narrate('Those who went in, went in male and female of all flesh, as God commanded him…', 'Genesis 7:16');
    // the door lifts and closes by itself
    stage.sfx('door');
    const glow = stage.addFlame(0, ARK.sill + 2, ARK.z + ARK.wid / 2 + 0.5, 6, false, '#fff2c0');
    rampOpen = false;
    await stage.tween(3, (t) => {
      door.rotation.x = lerp(DOOR_OPEN, -Math.PI / 2, t);
      (glow.material as THREE.SpriteMaterial).opacity = Math.sin(t * Math.PI);
    });
    stage.sfx('thud');
    await stage.narrate('…then Yahweh shut him in.', 'Genesis 7:16', 2.5);
  });
  door.rotation.x = -Math.PI / 2;
  stage.player.char.root.visible = false;
  stage.player.frozen = true;

  await stage.quiz('Selah', {
    q: 'Who shut the door of the ark?',
    options: ['Noah', 'Shem and Ham', 'God (Yahweh) himself', 'The wind blew it shut'],
    answer: 2,
    explain: 'Genesis 7:16 says, “Yahweh shut him in.” God closed the door himself; Noah’s family was safe in his hands.',
    ref: 'Genesis 7:16',
  });

  // ---- The flood
  await stage.cinematic(async () => {
    stage.player.char.root.visible = false;
    floodWater.visible = true;
    stage.rain.intensity = 1;
    stage.ambient('rain', 0.9);
    stage.ambient('waves', 0.6, 6);
    void stage.setAtmosphere('storm', 2);
    cam.cut({ x: 70, y: 22, z: 50 }, { x: 0, y: 4, z: -28 });
    stage.sfx('thunder');
    const floatArk = stage.onUpdate((_, t) => {
      const wy = floodWater.position.y;
      ark.position.y = Math.max(ARK.base, wy - 1.8) + (wy > 0 ? Math.sin(t * 0.8) * 0.4 : 0);
      ark.rotation.z = wy > 0 ? Math.sin(t * 0.6) * 0.03 : 0;
    });
    void stage.narrate('It rained on the earth forty days and forty nights.', 'Genesis 7:12');
    await stage.tween(11, (t) => (floodWater.position.y = lerp(-6, 22, t)), Ease.inOut);
    await cam.moveTo(stage.runner, { x: 40, y: 40, z: 60 }, { x: 0, y: 22, z: -28 }, 4);
    await stage.narrate('The waters flooded the earth one hundred fifty days.', 'Genesis 7:24');
    await stage.svc.ui.story.fade(1, 1.2);
    floatArk();
    stage.rain.intensity = 0;
    stage.ambient('rain', 0, 2);
    // the waters go down; the ship rests on the mountains
    const mx = 30;
    const mz = -125;
    const mh = stage.heightAt(mx, mz);
    ark.position.set(mx, mh - 1.4, mz);
    ark.rotation.set(0, 0.4, 0.05);
    floodWater.position.y = mh - 4;
    floodWater.position.z = -20;
    void stage.setAtmosphere('golden', 0.1);
    stage.ambient('wind', 0.2);
    stage.ambient('waves', 0.2);
    cam.cut({ x: mx + 60, y: mh + 22, z: mz + 75 }, { x: mx, y: mh + 4, z: mz });
    await stage.svc.ui.story.fade(0, 1.5);
    await stage.narrate('God remembered Noah… and the waters began to go down. The ship rested on the mountains.', 'Genesis 8:1–4');
    // the dove
    const start = new THREE.Vector3(mx, mh + 10, mz);
    const dove = stage.addBird((t) => {
      const k = (t % 9) / 9;
      return new THREE.Vector3(start.x + Math.sin(k * Math.PI * 2) * 30, start.y + Math.sin(k * Math.PI) * 10, start.z + 30 * Math.sin(k * Math.PI));
    }, '#ffffff', 2);
    dove.setTime(0);
    await cam.moveTo(stage.runner, { x: mx + 20, y: mh + 18, z: mz + 50 }, { x: mx + 10, y: mh + 12, z: mz + 15 }, 4);
    await stage.narrate('The dove came back to him at evening and, behold, in her mouth was a freshly plucked olive leaf.', 'Genesis 8:11');
    // the rainbow
    const bow = makeRainbow(160);
    bow.position.set(mx - 10, mh - 40, mz - 220);
    stage.scene.add(bow);
    stage.sfx('chime');
    await cam.moveTo(stage.runner, { x: mx + 30, y: mh + 8, z: mz + 70 }, { x: mx - 5, y: mh + 40, z: mz - 150 }, 4.5);
    await stage.tween(3, (t) => ((bow.material as THREE.ShaderMaterial).uniforms.opacity.value = t));
    stage.sfx('fanfare');
    await stage.narrate('God made a promise to Noah and to every living creature: never again would a flood destroy the earth. And he gave a sign…', 'Genesis 9:11–12', 2);
  });

  stage.svc.ui.hud.show(false);
  await stage.verse(META.verseId);
  return gameStars;
}

const flood: EraModule = {
  atmosphere: 'day',
  music: { root: 57, scale: SCALES.dorian, bpm: 84, instrument: 'oud', drone: 0.6, drums: 'soft', density: 0.42 },
  setup,
  play,
};

export default flood;
