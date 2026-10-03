import * as THREE from 'three';
import type { EraModule } from '../eraTypes';
import type { Stage } from '../../world/Stage';
import { Builder, G } from '../../world/geo';
import { Noise2D, smoothstep, rand, clamp } from '../../engine/noise';
import { SCALES, audio } from '../../engine/Audio';
import { Ease } from '../../engine/tasks';
import { palmTree, tent, rock, bush, grass, house, jar, campfire } from '../../world/props';
import { lerpColor } from '../../world/Terrain';
import { ParticleField } from '../../world/Particles';
import { Crowd } from '../../world/Crowd';
import { h } from '../../ui/dom';
import { ERA_BY_ID } from '../catalog';
import type { NPC } from '../../world/actors';

const META = ERA_BY_ID.jericho;
const R = 40; // wall radius
const RP = 55; // procession path radius
const SEGS = 24;
const THETA0 = Math.PI / 2; // start at the east gate

let segments: THREE.Group[] = [];
let ark: THREE.Group;
let joshua: NPC, spy1: NPC, spy2: NPC, rahab: NPC;
let priests: NPC[] = [];
let bearers: NPC[] = [];
let family: NPC[] = [];
let soldiers: Crowd;
let rear: Crowd;

const LOOKS = {
  joshua: { skin: '#9c6a45', robe: '#6a5a3a', robe2: '#8a3a2a', sash: '#c9a24a', hair: 'short', hairColor: '#2a1a12', beard: 'short', beardColor: '#3a2a1a', headwear: 'headwrap', headwearColor: '#d8c8a8', item: 'sword', armor: true },
  priest: { skin: '#9c6a45', robe: '#efe6d2', sash: '#2a4a8a', hair: 'short', beard: 'short', headwear: 'headwrap', headwearColor: '#ffffff', item: 'shofar' },
  bearer: { skin: '#8d5a3b', robe: '#efe6d2', sash: '#7a4a8a', hair: 'short', beard: 'short', headwear: 'headwrap', headwearColor: '#ffffff' },
  spy: { skin: '#8d5a3b', robe: '#7a5a3a', sash: '#3a3a48', hair: 'short', beard: 'short', headwear: 'keffiyeh', headwearColor: '#c9b48a' },
  rahab: { skin: '#b07650', robe: '#a8402e', robe2: '#c9a24a', sash: '#e0c080', hair: 'long', hairColor: '#2a1a12', headwear: 'veil', headwearColor: '#c0392b' },
  fam: { skin: '#b07650', robe: '#8a7a6a', sash: '#5a4030', hair: 'short', beard: 'short', headwear: 'headwrap', headwearColor: '#d8c8a8' },
} as const;

function makeArk(): THREE.Group {
  const b = new Builder();
  b.add(G.box(1.2, 0.75, 0.75), '#d9a93a', { kind: 'metal', y: 1.45 });
  b.add(G.box(1.3, 0.1, 0.85), '#f0c84a', { kind: 'metal', y: 1.87 });
  for (const s of [-1, 1]) {
    b.add(G.box(0.18, 0.4, 0.25), '#f0c84a', { kind: 'metal', x: s * 0.42, y: 2.12 });
    b.add(G.box(0.5, 0.06, 0.32), '#f0c84a', { kind: 'metal', x: s * 0.22, y: 2.32, rz: s * 0.5 });
    b.add(G.cyl(0.04, 0.04, 3.6, 6), '#d9a93a', { kind: 'metal', z: s * 0.3, y: 1.3, rx: Math.PI / 2, ry: Math.PI / 2 });
  }
  b.add(G.box(1.34, 0.08, 0.8), '#2a4a8a', { kind: 'cloth', y: 1.08 });
  return b.build();
}

function setup(stage: Stage): void {
  segments = [];
  priests = [];
  bearers = [];
  family = [];
  const noise = new Noise2D(37);
  const rng = stage.rng;
  const tell = (x: number, z: number) => smoothstep(62, 36, Math.hypot(x, z)) * 5;
  const ground = (x: number, z: number) => {
    let h = noise.fbm(x * 0.01, z * 0.01, 4) * 2 + tell(x, z);
    h += smoothstep(-90, -170, x) * 38 * (0.6 + 0.4 * noise.get(x * 0.02, z * 0.02));
    return h;
  };
  stage.heightFn = ground;
  stage.terrain({
    size: 420,
    segments: 140,
    centerX: 10,
    height: ground,
    color: (x, z, _y, slope) => {
      const oasis = Math.hypot(x - 64, z + 34) < 24;
      if (oasis) return lerpColor('#5d8f3e', '#7aa84f', noise.get(x * 0.1, z * 0.1) * 0.5 + 0.5);
      if (slope > 0.4) return lerpColor('#a07850', '#b8946a', noise.get(x * 0.05, z * 0.05) * 0.5 + 0.5);
      if (Math.hypot(x, z) < 48) return '#b99b72';
      return lerpColor('#c2a674', '#a8a065', noise.get(x * 0.02, z * 0.02) * 0.5 + 0.5);
    },
  });
  stage.bounds = { x0: -85, x1: 160, z0: -110, z1: 110 };
  stage.addCircle(0, 0, R + 1.6);

  // City interior (seen over the walls)
  const b = stage.statics;
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const r = rand(rng, 6, R - 6);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    house(b, { x, y: ground(x, z) - 0.2, z, ry: rng() * Math.PI }, rand(rng, 5, 8), rand(rng, 5, 8), rand(rng, 4, 7), i % 3 ? '#c9a578' : '#b8946a', { windows: true });
  }
  house(b, { x: 0, y: ground(0, 0), z: 0 }, 14, 12, 11, '#d8b88a', { door: true });
  b.add(G.box(6, 4, 6), '#c9a24a', { y: ground(0, 0) + 13, kind: 'std' });

  // Wall segments (each can fall outward independently)
  const H = 10;
  const T = 2.6;
  const segLen = ((2 * Math.PI * R) / SEGS) * 1.02;
  for (let i = 0; i < SEGS; i++) {
    const a = (i / SEGS) * Math.PI * 2;
    const outer = new THREE.Group();
    const x = Math.sin(a) * (R + T / 2);
    const z = Math.cos(a) * (R + T / 2);
    outer.position.set(x, ground(x, z) - 0.6, z);
    outer.rotation.y = a;
    const pivot = new THREE.Group();
    outer.add(pivot);
    const sb = new Builder(rng);
    sb.add(G.box(segLen, H, T), '#c2a27a', { y: H / 2, z: -T / 2, jitter: 0.06 });
    for (let k = 0; k < 7; k++) sb.add(G.box(0.8, 0.8, T + 0.1), '#c2a27a', { x: -segLen / 2 + 0.6 + k * (segLen / 7), y: H + 0.4, z: -T / 2 });
    // brick courses
    for (let k = 1; k < 5; k++) sb.add(G.box(segLen + 0.02, 0.08, 0.05), '#a88a62', { y: k * 2, z: 0.02 });
    if (i % 3 === 0) {
      sb.add(G.box(5, H + 4, 5), '#b89a72', { y: (H + 4) / 2, z: -T / 2 + 0.6 });
      for (let k = 0; k < 4; k++) sb.add(G.box(1, 1, 5.2), '#b89a72', { x: -2 + k * 1.33, y: H + 4.5, z: -T / 2 + 0.6 });
    }
    if (i === 6) {
      // east gate (shut tight)
      sb.add(G.box(5, 6.5, 0.6), '#5a3a22', { y: 3.25, z: 0.05 });
      for (let k = 0; k < 5; k++) sb.add(G.box(0.12, 6.4, 0.1), '#3a2414', { x: -2 + k, y: 3.2, z: 0.4 });
    }
    if (i === 0) {
      // Rahab's house built into the wall, with the scarlet cord
      sb.add(G.box(6, 5, 3.5), '#c9a578', { y: H - 1, z: 1.2 });
      sb.add(G.box(1.1, 1.1, 0.2), '#2a1c14', { x: 1.2, y: H - 0.6, z: 3.0 });
      sb.add(G.cyl(0.05, 0.05, H - 2, 4), '#d0202a', { x: 1.5, y: (H - 1.4) / 2, z: 3.1 });
      sb.add(G.box(0.8, 0.2, 0.3), '#d0202a', { x: 1.3, y: H - 1.1, z: 3.05 });
    }
    pivot.add(sb.build());
    stage.scene.add(outer);
    segments.push(pivot);
  }
  stage.addBox(0, R + 3.2, 6.5, 3.5);

  // Oasis & palms ("the city of palm trees")
  stage.water(14, 9, 64, ground(64, -34) + 0.1, -34, { deep: '#2b5a5a', shallow: '#6ab0a0', amp: 0.03, foam: 0.05 }, 6);
  for (let i = 0; i < 36; i++) {
    const a = rng() * Math.PI * 2;
    const r = rand(rng, 6, 26);
    const x = 64 + Math.cos(a) * r;
    const z = -34 + Math.sin(a) * r;
    palmTree(b, { x, y: ground(x, z), z }, rng);
    stage.addCircle(x, z, 0.5);
  }
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2;
    const r = rand(rng, 64, 120);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (x > 85 && Math.abs(z) < 40) continue;
    if (i % 3 === 0) palmTree(b, { x, y: ground(x, z), z }, rng);
    else rock(b, { x, y: ground(x, z) - 0.3, z, s: rand(rng, 0.7, 1.8) }, rng, '#a8906a');
    stage.addCircle(x, z, 0.8);
  }
  for (let i = 0; i < 60; i++) {
    const x = rand(rng, -80, 150);
    const z = rand(rng, -100, 100);
    if (Math.hypot(x, z) < 62) continue;
    bush(b, { x, y: ground(x, z), z }, rng, '#8a9a52');
  }
  grass(b, Math.round(600 * stage.svc.quality.particles), { x0: 40, x1: 90, z0: -60, z1: -10 }, ground, (x, z) => Math.hypot(x - 64, z + 34) < 24, rng);

  // Israel's camp at Gilgal (east)
  for (let i = 0; i < 26; i++) {
    const x = rand(rng, 96, 150);
    const z = rand(rng, -38, 38);
    const ry = rand(rng, 0, Math.PI);
    tent(b, { x, y: ground(x, z), z, ry }, i % 3 ? '#3e3028' : '#5a4436');
    stage.addBox(x, z, 4.2, 3.8, ry);
  }
  campfire(b, { x: 92, y: ground(92, 14), z: 14 });
  stage.addFlame(92, ground(92, 14) + 0.5, 14, 0.9, false);
  for (let i = 0; i < 10; i++) jar(b, { x: 98 + (i % 5), y: ground(98, -20), z: -20 + Math.floor(i / 5) }, '#b5653a');

  // People
  joshua = stage.addNPC('Joshua', { ...LOOKS.joshua }, 78, 4, -Math.PI / 2, '#8a3a2a');
  spy1 = stage.addNPC('A spy (Joshua’s scout)', { ...LOOKS.spy }, 96, -12, -1.2, '#7a5a3a');
  spy2 = stage.addNPC('Second spy', { ...LOOKS.spy, robe: '#5a4a3a' }, 97.5, -10, -1.6, '#5a4a3a');
  spy2.showTag = false;
  for (let i = 0; i < 7; i++) {
    const p = stage.addNPC(i === 0 ? 'Priest' : `Priest ${i + 1}`, { ...LOOKS.priest }, 82 + i * 1.2, 12, -Math.PI / 2, '#2a4a8a');
    p.showTag = i === 0;
    priests.push(p);
  }
  ark = makeArk();
  ark.position.set(86, ground(86, -4), -4);
  stage.scene.add(ark);
  for (let i = 0; i < 4; i++) {
    const n = stage.addNPC('Priest', { ...LOOKS.bearer }, 85 + (i % 2) * 2, -5 + Math.floor(i / 2) * 2, -Math.PI / 2, '#7a4a8a');
    n.showTag = false;
    n.setPose('carry');
    bearers.push(n);
  }
  soldiers = new Crowd(42, rng, { armor: true, robes: ['#6a5a3a', '#7a4a2a', '#5a4a3a', '#8a3a2a'] });
  rear = new Crowd(Math.round(70 * Math.max(0.6, stage.svc.quality.particles)), rng);
  for (let i = 0; i < soldiers.count; i++) soldiers.place(i, 100 + (i % 6) * 1.4, 22 + Math.floor(i / 6) * 1.4, -Math.PI / 2);
  for (let i = 0; i < rear.count; i++) rear.place(i, rand(rng, 100, 140), rand(rng, -35, 35), rand(rng, 0, 6), i % 2 === 0);
  stage.scene.add(soldiers.group, rear.group);
  const gr = (x: number, z: number) => stage.heightAt(x, z);
  stage.onUpdate((dt) => {
    soldiers.update(dt, gr);
    rear.update(dt, gr);
  });

  stage.fragment(META.fragments[0], 52, -48);
  stage.fragment(META.fragments[1], 140, 30);
  stage.fragment(META.fragments[2], -14, R + 8);

  stage.player.teleport(110, 0, -Math.PI / 2, stage);
}

/** Position on the procession path; returns [x, z, heading]. */
function onPath(theta: number, lateral = 0): [number, number, number] {
  const r = RP + lateral;
  const x = Math.sin(theta) * r;
  const z = Math.cos(theta) * r;
  // walking counter-clockwise seen from above: tangent of decreasing theta
  const heading = Math.atan2(-Math.cos(theta), Math.sin(theta));
  return [x, z, heading];
}

async function play(stage: Stage): Promise<number> {
  const cam = stage.svc.cam;
  const hud = stage.svc.ui.hud;
  const input = stage.svc.input;
  stage.ambient('wind', 0.25);

  await stage.cinematic(async () => {
    cam.orbit(stage.runner, { x: 0, y: 10, z: 0 }, 95, 40, 0.6, 1.4, 9).catch(() => undefined);
    await stage.narrate('Now Jericho was tightly shut up because of the children of Israel. No one went out, and no one came in.', 'Joshua 6:1');
    await stage.wait(1.5);
    await cam.moveTo(stage.runner, { x: 118, y: 3, z: 6 }, { x: 110, y: 1.6, z: 0 }, 3);
  });

  stage.objective('Report to Joshua', joshua);
  stage.chatter(spy1, [
    [
      stage.line(spy1, 'Joshua sent the two of us to spy out Jericho. The king found out and sent men to catch us.'),
      stage.line(spy1, 'A woman named Rahab hid us on her roof under stalks of flax.', 'Joshua 2:6'),
      stage.line(spy1, 'She said: “We have heard how Yahweh dried up the water of the Red Sea before you… for Yahweh your God, he is God in heaven above, and on earth beneath.”', 'Joshua 2:10–11'),
      stage.line(spy1, 'We promised to save her family. Her house is on the wall. Look for the scarlet cord in the window.', 'Joshua 2:18'),
    ],
  ]);
  let spyQuiz = false;
  stage.interactable(spy2, 'Talk to the second spy', async () => {
    if (spyQuiz) return void (await stage.talk([stage.line(spy2, 'A promise is a promise. When the walls come down, we go and get her.')]));
    spyQuiz = true;
    await stage.talk([stage.line(spy2, 'Did my friend tell you how we escaped? Let’s see if you were listening.')]);
    await stage.quiz('The second spy', {
      q: 'What did the spies tell Rahab to tie in her window?',
      options: ['A white flag', 'A line of scarlet thread', 'A palm branch', 'A golden bell'],
      answer: 1,
      explain: 'The spies told her to “tie this line of scarlet thread in the window”. Every family member inside her house would be safe.',
      ref: 'Joshua 2:18',
    });
  }, 3);

  await stage.waitTalk(joshua);
  const pk = await stage.talk([
    stage.line(joshua, 'You’re the traveller the scouts mentioned. Good timing.'),
    stage.line(joshua, 'Yahweh said to me: “Behold, I have given Jericho into your hand, with its king and the mighty men of valor.”', 'Joshua 6:2'),
    stage.line(joshua, '“All of your men of war shall march around the city, going around the city once. You shall do this six days.”', 'Joshua 6:3'),
    stage.line(joshua, '“On the seventh day, you shall march around the city seven times, and the priests shall blow the trumpets.” Then, at the long blast… everyone shouts.', 'Joshua 6:4–5'),
    { ...stage.line(joshua, 'Any questions?'), choices: ['Why not just attack the walls?', 'Why stay silent while we march?'] },
  ]);
  await stage.talk([
    pk[0] === 0
      ? stage.line(joshua, 'With what? We have no rams and no ladders, and those walls are as thick as a house. When Jericho falls, everyone will know who did it. Not us. God.')
      : stage.line(joshua, 'Because I commanded it: “You shall not shout nor let your voice be heard… until the day I tell you to shout.” Trust is quiet before it is loud.', 'Joshua 6:10'),
    stage.line(joshua, 'March with the priests. Keep in step with the drum, and keep silent. Go and see the lead priest.'),
  ]);
  stage.addXP(40, 'Met Joshua');

  const lead = priests[0];
  stage.objective('Join the priests with the trumpets', lead);
  await stage.waitTalk(lead, 'Talk to the lead priest');
  await stage.talk([
    stage.line(lead, 'Seven priests, seven rams’ horns, marching before the ark of the covenant.', 'Joshua 6:4'),
    stage.line(lead, 'Here’s how you keep in step: every time the drum beats, press Act (F, Space, a click, or the Act button). Hit it right on the beat!'),
    stage.line(lead, 'Six days, once around. On the seventh day, seven times, and faster each time. Then… we wait for Joshua.'),
  ]);
  stage.objective(null);

  // ---- The march (rhythm mini-game)
  const ui = h('div', { class: 'beat-ui' }, h('div', { class: 'beat-ring' }), h('div', { class: 'beat-core' }), h('div', { class: 'beat-fb' }));
  hud.el.appendChild(ui);
  const ring = ui.querySelector('.beat-ring') as HTMLDivElement;
  const fb = ui.querySelector('.beat-fb') as HTMLDivElement;
  let perfect = 0;
  let good = 0;
  let miss = 0;
  let off = 0;
  let totalBeats = 0;
  stage.player.scripted = true;
  input.mouseAction = true;
  input.setActionLabel('Step');
  stage.music({ root: 50, scale: SCALES.hijaz, bpm: 96, instrument: 'flute', drone: 0.8, drums: 'none', density: 0.12 });
  for (const n of [...priests, ...bearers, joshua]) n.manual = true;
  cam.lockYaw = true;
  cam.distance = 12;
  cam.pitch = 0.32;

  const placeProcession = (s: number, speed: number) => {
    const theta = THETA0 - s / RP;
    // soldiers in front
    for (let i = 0; i < soldiers.count; i++) {
      const [x, z, hd] = onPath(theta - (14 + Math.floor(i / 3) * 1.6) / RP, ((i % 3) - 1) * 1.3);
      soldiers.place(i, x, z, hd);
      soldiers.people[i].speed = speed;
    }
    priests.forEach((p, i) => {
      const [x, z, hd] = onPath(theta - (3 + i * 1.5) / RP, i % 2 ? 0.7 : -0.7);
      p.place(x, z, hd, stage);
      p.char.speed = speed;
      p.char.pose = 'blow';
    });
    const [px, pz, ph] = onPath(theta);
    stage.player.position.set(px, stage.heightAt(px, pz), pz);
    stage.player.char.heading = ph;
    stage.player.char.root.rotation.y = ph;
    stage.player.char.speed = speed;
    const [ax, az, ah] = onPath(theta + 4 / RP);
    ark.position.set(ax, stage.heightAt(ax, az), az);
    ark.rotation.y = ah;
    bearers.forEach((n, i) => {
      const [x, z, hd] = onPath(theta + (2.7 + (i >> 1) * 2.6) / RP, i % 2 ? 0.75 : -0.75);
      n.place(x, z, hd, stage);
      n.char.speed = speed;
    });
    const [jx, jz, jh] = onPath(theta + 9 / RP, 1.5);
    joshua.place(jx, jz, jh, stage);
    joshua.char.speed = speed;
    for (let i = 0; i < rear.count; i++) {
      const [x, z, hd] = onPath(theta + (12 + Math.floor(i / 3) * 1.6) / RP, ((i % 3) - 1) * 1.3);
      rear.place(i, x, z, hd, false);
    }
    cam.yaw = theta - 0.75;
  };

  const runSegment = async (beats: number, bpm: number, startS: number) => {
    const interval = 60 / bpm;
    const speed = 2.3 * (bpm / 96);
    const t0 = stage.runner.time + 1.2;
    const judged = new Array<boolean>(beats).fill(false);
    let nextSound = 0;
    let s = startS;
    totalBeats += beats;
    const show = (text: string, cls: string) => {
      fb.textContent = text;
      fb.className = `beat-fb ${cls}`;
      void fb.offsetWidth;
      fb.classList.add('show');
    };
    audio.play('shofar', 0.7);
    const stop = stage.onUpdate((dt) => {
      const t = stage.runner.time;
      s += speed * dt;
      placeProcession(s, speed);
      while (nextSound < beats && t >= t0 + nextSound * interval) {
        audio.play('drum');
        ring.classList.remove('pulse');
        void ring.offsetWidth;
        ring.classList.add('pulse');
        nextSound++;
      }
      // missed beats
      for (let k = 0; k < beats; k++) {
        if (!judged[k] && t > t0 + k * interval + 0.22) {
          judged[k] = true;
          miss++;
          show('Miss', 'miss');
        }
      }
      if (input.pressed('action') || input.pressed('jump') || input.pressed('interact')) {
        const k = Math.round((t - t0) / interval);
        const d = Math.abs(t - (t0 + k * interval));
        if (k >= 0 && k < beats && !judged[k] && d <= 0.22) {
          judged[k] = true;
          if (d <= 0.1) {
            perfect++;
            show('Perfect!', 'perfect');
          } else {
            good++;
            show('Good', 'good');
          }
        } else {
          off++;
          show('Off-beat', 'off');
        }
      }
      const acc = totalBeats ? (perfect + 0.6 * good) / Math.max(1, perfect + good + miss) : 0;
      hud.setMeter('step', `In step: ${Math.round(acc * 100)}%`, acc, '#f3c86a');
    });
    await stage.waitUntil(() => stage.runner.time > t0 + beats * interval + 0.3);
    stop();
    return s;
  };

  const dayCard = async (title: string, sub: string, atm: string) => {
    await stage.svc.ui.story.fade(1, 0.45, '#1a1030');
    void stage.setAtmosphere(atm, 0.1);
    hud.setBanner(title, sub);
    await stage.wait(1.4);
    hud.setBanner(null);
    await stage.svc.ui.story.fade(0, 0.45, '#1a1030');
  };

  let s = 0;
  for (let day = 1; day <= 6; day++) {
    await dayCard(`Day ${day}`, day === 1 ? 'March around the city once. Stay silent.' : 'Once around the city, then back to camp.', day % 2 ? 'day' : 'golden');
    s = (day - 1) * 30;
    placeProcession(s, 0);
    s = await runSegment(12, 96, s);
  }
  await dayCard('Day 7', 'They rose early at dawn… seven times around (Joshua 6:15)', 'dawn');
  void stage.setAtmosphere('day', 20);
  for (let lap = 1; lap <= 7; lap++) {
    hud.setBanner(`Lap ${lap} / 7`);
    setTimeout(() => hud.setBanner(null), 900);
    s = await runSegment(12, 96 + lap * 6, s + 6);
  }
  ui.remove();
  hud.setMeter('step', null);
  input.setActionLabel(null);
  const accuracy = clamp((perfect + 0.6 * good) / Math.max(1, totalBeats) - off * 0.01, 0, 1);
  const gameStars = accuracy >= 0.8 ? 3 : accuracy >= 0.55 ? 2 : 1;
  stage.addXP(Math.round(accuracy * 200), `Marching ${Math.round(accuracy * 100)}% in step`);
  for (const n of [...priests, ...bearers]) n.char.speed = 0;
  joshua.char.speed = 0;
  stage.player.char.speed = 0;

  // ---- The shout
  audio.play('shofar');
  const pick = await stage.talk([
    stage.n('At the seventh time, when the priests blew the trumpets…', 'Joshua 6:16'),
    { ...stage.line(joshua, '“Shout, for Yahweh has given you the city!”', 'Joshua 6:16'), choices: ['🎤 Shout into my microphone!', '👆 Tap Act as fast as I can!'] },
  ]);
  let level: (() => number) | null = null;
  if (pick[0] === 0) {
    try {
      level = await audio.startMic();
    } catch {
      stage.toast('No microphone available, so tap Act instead!', 'warn');
    }
  }
  let power = 0;
  let shoutT = 0;
  hud.setBanner('SHOUT!', level ? 'Shout into your microphone!' : 'Tap Act as fast as you can!');
  input.setActionLabel('SHOUT');
  for (const p of [...soldiers.people, ...rear.people]) p.cheer = true;
  stage.sfx('cheer');
  const stopShout = stage.onUpdate((dt) => {
    shoutT += dt;
    if (level) power += Math.max(0, level() - 0.12) * dt * 2.2;
    if (input.pressed('action') || input.pressed('jump') || input.pressed('interact')) power += 0.075;
    power = Math.min(1, Math.max(0, power - dt * 0.06));
    hud.setMeter('shout', 'A GREAT SHOUT', power, '#ff9a4a');
    if (Math.random() < dt * 2) stage.sfx('cheer', 0.5);
  });
  await stage.waitUntil(() => power >= 1 || shoutT > 9);
  stopShout();
  audio.stopMic();
  hud.setBanner(null);
  hud.setMeter('shout', null);
  input.setActionLabel(null);
  input.mouseAction = false;
  if (power >= 1) stage.addXP(50, 'A great shout!');

  // ---- The walls fall
  await stage.cinematic(async () => {
    cam.cut({ x: 92, y: 16, z: 70 }, { x: 0, y: 6, z: 0 });
    stage.sfx('rumble');
    stage.sfx('thunder', 0.6);
    if (!stage.svc.getSave().settings.reduceMotion) cam.shake(0.45, 4);
    const dust = stage.addField(
      new ParticleField({
        count: Math.round(320 * stage.svc.quality.particles),
        color: '#cdb08a',
        size: 4,
        additive: false,
        opacity: 0.55,
        spawn: (p, v) => {
          const a = Math.random() * Math.PI * 2;
          p.set(Math.sin(a) * (R + rand(Math.random, 0, 10)), Math.random() * 3, Math.cos(a) * (R + rand(Math.random, 0, 10)));
          v.set(Math.sin(a) * 3, 2 + Math.random() * 3, Math.cos(a) * 3);
          return 2.5 + Math.random() * 2;
        },
        drag: 0.6,
      }),
    );
    const delays = segments.map(() => Math.random() * 1.2);
    await stage.tween(4.2, (t) => {
      segments.forEach((sg, i) => {
        if (i === 0) return; // Rahab's house stands
        const k = clamp((t * 4.2 - delays[i]) / 1.8, 0, 1);
        sg.rotation.x = Ease.in(k) * 1.48;
      });
    }, Ease.linear);
    stage.sfx('thud');
    await stage.narrate('The people shouted with a great shout, and the wall fell down flat, so that the people went up into the city, every man straight in front of him.', 'Joshua 6:20');
    dust.emitting = false;
    await cam.moveTo(stage.runner, { x: 20, y: 18, z: 75 }, { x: 0, y: 6, z: R }, 3);
    await stage.narrate('Only one part of the wall still stood: the house with the scarlet cord.');
  });
  stage.clearColliders((c) => Math.hypot(c.x, c.z) < 1);
  stage.addCircle(0, 0, R - 2);

  // ---- Rahab
  stage.music({ root: 55, scale: SCALES.mixolydian, bpm: 100, instrument: 'harp', drone: 0.5, drums: 'soft', density: 0.45 });
  for (const n of [...priests, ...bearers, joshua]) n.manual = false;
  stage.player.scripted = false;
  cam.lockYaw = false;
  cam.distance = 7.5;
  const hx = 3;
  const hz = R + 7;
  stage.player.teleport(hx + 8, hz + 10, Math.PI * 1.2, stage);
  spy1.place(hx - 2, hz + 3, 0, stage);
  spy2.place(hx + 1.5, hz + 3, 0, stage);
  spy2.showTag = false;
  rahab = stage.addNPC('Rahab', { ...LOOKS.rahab }, hx, hz, 0, '#a8402e');
  for (let i = 0; i < 4; i++) family.push(stage.addNPC('Rahab’s family', { ...LOOKS.fam, robe: ['#8a7a6a', '#6a5a7a', '#7a6a4a', '#5a6a5a'][i], height: i === 3 ? 0.7 : 1 }, hx - 3 + i * 1.5, hz - 1.5, 0));
  family.forEach((f) => (f.showTag = false));
  stage.objective('Meet Rahab and her family', rahab);
  await stage.waitTalk(rahab);
  await stage.talk([
    stage.line(spy1, '“Go into the house, and bring the woman and all that she has out from there, as you swore to her.” Joshua’s orders. We kept our word.', 'Joshua 6:22'),
    stage.line(rahab, 'My father, my mother, my brothers, all of us. Every one of us is alive.', 'Joshua 6:23'),
    stage.line(rahab, 'When I heard what your God did at the Red Sea, I knew. Yahweh your God, he is God in heaven above, and on earth beneath.', 'Joshua 2:11'),
    stage.n('Rahab lived among Israel from that day on. Generations later, her great-great-grandson was King David, and she is named in the family line of Jesus.', 'Joshua 6:25; Matthew 1:5'),
    stage.line(joshua, 'Hear me, traveller. Before we ever crossed the Jordan, God gave me words to carry. Carry them with you.'),
  ]);
  await stage.verse(META.verseId);
  return gameStars;
}

const jericho: EraModule = {
  atmosphere: 'hot',
  music: { root: 50, scale: SCALES.hijaz, bpm: 92, instrument: 'oud', drone: 0.7, drums: 'frame', density: 0.4 },
  setup,
  play,
};

export default jericho;
