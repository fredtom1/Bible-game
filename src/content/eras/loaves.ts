import * as THREE from 'three';
import type { EraModule } from '../eraTypes';
import type { Stage } from '../../world/Stage';
import { Builder, G } from '../../world/geo';
import { Noise2D, smoothstep, rand } from '../../engine/noise';
import { SCALES } from '../../engine/Audio';
import { oliveTree, rock, bush, grass, flowers, boat, reeds, leafyTree } from '../../world/props';
import { lerpColor } from '../../world/Terrain';
import { ParticleField, makeFlame } from '../../world/Particles';
import { Crowd } from '../../world/Crowd';
import { makeLabel, type Look } from '../../world/Character';
import { ERA_BY_ID } from '../catalog';
import type { NPC } from '../../world/actors';

const META = ERA_BY_ID.loaves;
const SHORE = 62;
const JESUS = new THREE.Vector3(0, 0, -20);

let jesus: NPC, philip: NPC, andrew: NPC, peter: NPC, john: NPC, boy: NPC;
let crowd: Crowd;
let groups: { x: number; z: number; fed: boolean; label: THREE.Sprite; from: number; to: number }[] = [];
let helpers: NPC[] = [];

const LOOKS: Record<string, Look> = {
  jesus: { skin: '#9c6a45', robe: '#e8dcc0', robe2: '#e8dcc0', sash: '#8a2a2a', hair: 'long', hairColor: '#2a1a12', beard: 'short', beardColor: '#2a1a12' },
  philip: { skin: '#9c6a45', robe: '#7a5a3a', sash: '#c9a24a', hair: 'short', hairColor: '#2a1a12', beard: 'short', headwear: 'headwrap', headwearColor: '#d8c8a8' },
  andrew: { skin: '#8d5a3b', robe: '#5a6a3a', sash: '#d8c8a8', hair: 'short', beard: 'long', beardColor: '#3a2a1a', headwear: 'headwrap', headwearColor: '#c9b48a' },
  peter: { skin: '#8d5a3b', robe: '#2f5a7a', sash: '#d8c8a8', hair: 'short', hairColor: '#4a4440', beard: 'long', beardColor: '#5a5450' },
  john: { skin: '#9c6a45', robe: '#a8402e', sash: '#e0c080', hair: 'long', hairColor: '#2a1a12' },
  boy: { skin: '#9c6a45', robe: '#c9b48a', sash: '#7a4a8a', hair: 'short', hairColor: '#1d1410', height: 0.68, item: 'basket' },
  helper: { skin: '#8d5a3b', robe: '#6a5a4a', sash: '#c9a24a', hair: 'short', beard: 'short', headwear: 'headwrap', headwearColor: '#e8dcc0', item: 'basket' },
};

function setup(stage: Stage): void {
  groups = [];
  helpers = [];
  const noise = new Noise2D(71);
  const rng = stage.rng;
  const ground = (x: number, z: number) => {
    let h = smoothstep(SHORE + 4, -70, z) * 26 + noise.fbm(x * 0.015, z * 0.015, 4) * 2.5;
    h -= smoothstep(SHORE - 6, SHORE + 10, z) * 3;
    return h;
  };
  stage.heightFn = ground;
  JESUS.y = ground(JESUS.x, JESUS.z);
  stage.terrain({
    size: 320,
    segments: 130,
    height: ground,
    color: (x, z, y, slope) => {
      if (z > SHORE - 4 && y < 1) return lerpColor('#b8a27a', '#cdb890', noise.get(x * 0.1, z * 0.1) * 0.5 + 0.5);
      if (slope > 0.4) return lerpColor('#7a7058', '#958a6a', noise.get(x * 0.05, z * 0.05) * 0.5 + 0.5);
      return lerpColor('#5f9a3e', '#8cc05a', noise.get(x * 0.03, z * 0.03) * 0.5 + 0.5);
    },
  });
  stage.bounds = { x0: -80, x1: 80, z0: -75, z1: SHORE + 6 };
  stage.water(420, 220, 0, -0.2, SHORE + 100, { deep: '#1d5a7a', shallow: '#5ab0c8', amp: 0.3, foam: 0.25 }, 50);
  const b = stage.statics;
  boat(b, { x: -22, y: -0.1, z: SHORE + 8, ry: 0.4 });
  boat(b, { x: 14, y: -0.1, z: SHORE + 10, ry: -0.3 }, '#6a4428');
  for (let i = 0; i < 14; i++) reeds(b, { x: rand(rng, -70, 70), y: ground(0, SHORE + 2), z: SHORE + rand(rng, 0, 4) }, rng);
  // Jesus' rock on the hillside
  b.add(G.dodeca(2), '#9a8f80', { x: JESUS.x, y: ground(JESUS.x, JESUS.z) - 1.1, z: JESUS.z - 1.5, sy: 0.6, sx: 1.4 });
  for (let i = 0; i < 70; i++) {
    const x = rand(rng, -78, 78);
    const z = rand(rng, -72, SHORE - 6);
    if (Math.abs(x) < 50 && z > -32 && z < 46) continue;
    if (i % 4 === 0) oliveTree(b, { x, y: ground(x, z), z }, rng);
    else if (i % 4 === 1) leafyTree(b, { x, y: ground(x, z), z }, rng, '#5f9a3e');
    else rock(b, { x, y: ground(x, z) - 0.3, z, s: rand(rng, 0.7, 1.6) }, rng);
    stage.addCircle(x, z, 0.9);
  }
  // fig tree by the shore where the boy waits
  leafyTree(b, { x: 34, y: ground(34, SHORE - 8), z: SHORE - 8, s: 1.4 }, rng, '#4f8a35');
  stage.addCircle(34, SHORE - 8, 1.2);
  for (let i = 0; i < 40; i++) bush(b, { x: rand(rng, -78, 78), y: 0, z: rand(rng, -72, SHORE - 6) }, rng);
  grass(b, Math.round(1800 * stage.svc.quality.particles), { x0: -75, x1: 75, z0: -70, z1: SHORE - 4 }, ground, () => true, rng, ['#6aa84f', '#86bf5c', '#5c9a44', '#9acb6a']);
  flowers(b, Math.round(700 * stage.svc.quality.particles), { x0: -75, x1: 75, z0: -70, z1: SHORE - 4 }, ground, () => true, rng, ['#e85a7a', '#ffffff', '#f3d34a', '#b07ad8', '#ff9a4a']);

  // The crowd: groups that will sit in ranks
  const centers: [number, number][] = [];
  for (const z of [0, 17, 34]) for (const x of [-40, -20, 20, 40]) centers.push([x + rand(rng, -2, 2), z + rand(rng, -2, 2)]);
  const per = Math.max(16, Math.round(32 * Math.max(0.6, stage.svc.quality.particles)));
  crowd = new Crowd(centers.length * per, rng);
  centers.forEach(([cx, cz], gi) => {
    const from = gi * per;
    for (let k = 0; k < per; k++) {
      crowd.place(from + k, cx + rand(rng, -7, 7), cz + rand(rng, -6, 6), rand(rng, 0, Math.PI * 2));
    }
    const label = makeLabel('Hungry', { size: 0.6, color: '#ffe9b0' });
    label.position.set(cx, ground(cx, cz) + 3.4, cz);
    label.visible = false;
    stage.scene.add(label);
    groups.push({ x: cx, z: cz, fed: false, label, from, to: from + per });
  });
  stage.scene.add(crowd.group);
  stage.onUpdate((dt) => crowd.update(dt, (x, z) => stage.heightAt(x, z)));

  jesus = stage.addNPC('Jesus', { ...LOOKS.jesus }, JESUS.x, JESUS.z, 0, '#8a2a2a');
  philip = stage.addNPC('Philip', { ...LOOKS.philip }, -6, -12, 0.3, '#7a5a3a');
  andrew = stage.addNPC('Andrew', { ...LOOKS.andrew }, 5, -14, -0.4, '#5a6a3a');
  peter = stage.addNPC('Simon Peter', { ...LOOKS.peter }, 3, -22, 0.6, '#2f5a7a');
  john = stage.addNPC('John', { ...LOOKS.john }, -3, -22, -0.4, '#a8402e');
  boy = stage.addNPC('The boy', { ...LOOKS.boy }, 34, SHORE - 6, Math.PI, '#c9b48a');
  boy.setPose('carry');

  stage.fragment(META.fragments[0], -60, -40);
  stage.fragment(META.fragments[1], 58, 18);
  stage.fragment(META.fragments[2], -30, SHORE - 3);

  stage.player.teleport(-10, 2, Math.PI, stage);
}

async function play(stage: Stage): Promise<number> {
  const cam = stage.svc.cam;
  const hud = stage.svc.ui.hud;
  stage.ambient('waves', 0.25);
  stage.ambient('crowd', 0.45);
  stage.ambient('wind', 0.15);

  await stage.cinematic(async () => {
    cam.cut({ x: -60, y: 30, z: 90 }, { x: 0, y: 6, z: 0 });
    await stage.narrate('After these things, Jesus went away to the other side of the sea of Galilee. A great multitude followed him, because they saw his signs.', 'John 6:1–2');
    await cam.moveTo(stage.runner, { x: 10, y: 6, z: -32 }, { x: 0, y: 2, z: 10 }, 5);
    await stage.narrate('Jesus therefore lifting up his eyes, and seeing that a great multitude was coming to him, said to Philip, “Where are we to buy bread, that these may eat?”', 'John 6:5');
    await cam.moveTo(stage.runner, { x: -11, y: 3, z: 8 }, { x: -10, y: 1.5, z: 2 }, 3);
  });

  stage.chatter(peter, [[stage.line(peter, 'I’ve fished this lake my whole life, friend. I know exactly how many people five loaves can feed. Five. Maybe.')]]);
  stage.chatter(john, [[stage.line(john, 'Watch closely today. Someone ought to write all of this down one day.')]]);
  stage.objective('Talk to Philip', philip);
  await stage.waitTalk(philip);
  await stage.talk([
    stage.line(philip, 'Did you hear what he asked me? “Where are we to buy bread, that these may eat?”', 'John 6:5'),
    stage.line(philip, 'I did the maths: “Two hundred denarii worth of bread is not sufficient for them, that every one of them may receive a little.”', 'John 6:7'),
    stage.n('A denarius was about a day’s wages for a worker. Two hundred denarii was over half a year’s pay, and it still wouldn’t be enough.'),
    stage.n('John adds something Philip didn’t know yet: “He said this to test him, for he himself knew what he would do.”', 'John 6:6'),
    stage.line(philip, 'Andrew is over there. He said he’d found… something.'),
  ]);
  stage.objective('Talk to Andrew', andrew);
  await stage.waitTalk(andrew);
  await stage.talk([
    stage.line(andrew, '“There is a boy here who has five barley loaves and two fish, but what are these among so many?”', 'John 6:9'),
    stage.line(andrew, 'He was sitting under the fig tree down by the shore. Would you bring him to Jesus?'),
  ]);

  stage.objective('Find the boy by the fig tree near the shore', boy);
  await stage.waitTalk(boy);
  const bp = await stage.talk([
    stage.line(boy, 'Hello! My mother packed my lunch. Five barley loaves and two little fish.'),
    { ...stage.line(boy, 'It’s not much. Why are you looking at my basket like that?'), choices: ['Would you share it with Jesus?', 'Jesus has thousands of people to feed…'] },
  ]);
  await stage.talk([
    bp[0] === 0 ? stage.line(boy, 'With Jesus? Really? Yes! I’ll bring it myself!') : stage.line(boy, '…and I have five loaves. That’s silly. But… maybe he could use them anyway? Let’s go!'),
  ]);
  boy.followTarget = stage.player.char.root;
  boy.followDist = 1.8;
  boy.followSpeed = 6;
  stage.objective('Bring the boy to Jesus', jesus);
  await stage.waitUntil(() => boy.position.distanceTo(JESUS) < 6 && stage.player.position.distanceTo(JESUS) < 6);
  boy.followTarget = null;

  // ---- The miracle
  await stage.cinematic(async () => {
    boy.place(1.5, JESUS.z + 2.4, Math.PI, stage);
    stage.player.teleport(-2.5, JESUS.z + 4, Math.PI * 0.9, stage);
    jesus.face(boy.position.x, boy.position.z);
    cam.cut({ x: 6, y: 3, z: JESUS.z + 6 }, { x: 0, y: 1.4, z: JESUS.z + 1 });
    await stage.narrate('Jesus said, “Have the people sit down.” Now there was much grass in that place. So the men sat down, in number about five thousand.', 'John 6:10');
    centersSit();
    cam.cut({ x: 0, y: 14, z: JESUS.z - 8 }, { x: 0, y: 2, z: 20 });
    await stage.narrate('They sat down in ranks, by hundreds and by fifties.', 'Mark 6:40');
    cam.cut({ x: 3.5, y: 2.2, z: JESUS.z + 4 }, { x: 0, y: 1.6, z: JESUS.z });
    jesus.setPose('pray');
    jesus.char.attachItem('bread');
    await stage.narrate('Jesus took the loaves; and having given thanks, he distributed to the disciples, and the disciples to those who were sitting down; likewise also of the fish as much as they desired.', 'John 6:11');
    jesus.setPose('idle');
  });
  function centersSit() {
    for (const g of groups) {
      const n = g.to - g.from;
      const cols = Math.ceil(Math.sqrt(n * 1.5));
      for (let k = 0; k < n; k++) {
        const r = Math.floor(k / cols);
        const c = k % cols;
        crowd.place(g.from + k, g.x - cols * 0.55 + c * 1.1, g.z - 2.5 + r * 1.3, Math.atan2(JESUS.x - g.x, JESUS.z - g.z), true);
      }
      g.label.visible = true;
    }
  }

  // ---- Distribution
  stage.music({ root: 60, scale: SCALES.majorPent, bpm: 104, instrument: 'harp', drone: 0.5, drums: 'soft', density: 0.5 });
  boy.followTarget = null;
  for (let i = 0; i < 3; i++) {
    const hlp = stage.addNPC('Disciple', { ...LOOKS.helper, robe: ['#6a5a4a', '#4a5a6a', '#7a6a3a'][i] }, -3 + i * 3, JESUS.z + 3, 0);
    hlp.showTag = false;
    helpers.push(hlp);
    void (async () => {
      for (;;) {
        const g = groups[Math.floor(Math.random() * groups.length)];
        await hlp.walkTo(stage.runner, g.x + rand(Math.random, -4, 4), g.z - 4, 2.4);
        await stage.wait(1.5);
        await hlp.walkTo(stage.runner, JESUS.x + rand(Math.random, -3, 3), JESUS.z + 3, 2.4);
      }
    })().catch(() => undefined);
  }
  let carrying = 0;
  let fed = 0;
  let t = 0;
  const CAP = 4;
  const total = groups.length;
  stage.objective('Take bread from Jesus’ basket', jesus, `Fed 0/${total}`);
  const giveBread = () => {
    if (carrying > 0) {
      stage.toast('Your basket is still full. Go and share it!', 'info');
      return;
    }
    carrying = CAP;
    stage.player.char.attachItem('basket');
    stage.sfx('pickup');
    stage.toast(fed === 0 ? 'A full basket of bread and fish!' : 'Somehow… the basket is full again!', 'good');
    stage.objective('Share the bread with the hungry groups', () => nearestHungry(), `Fed ${fed}/${total}`);
  };
  stage.interactable(jesus, 'Take bread', giveBread, 3.4, () => fed < total);
  const nearestHungry = () => {
    let best = groups[0];
    let bd = Infinity;
    for (const g of groups) {
      if (g.fed) continue;
      const d = Math.hypot(g.x - stage.player.position.x, g.z - stage.player.position.z);
      if (d < bd) {
        bd = d;
        best = g;
      }
    }
    return new THREE.Vector3(best.x, 0, best.z);
  };
  for (const g of groups) {
    stage.interactable(new THREE.Vector3(g.x, 0, g.z), 'Share the bread', () => {
      if (carrying <= 0) {
        stage.toast('Your basket is empty. Go back to Jesus for more.', 'warn');
        return;
      }
      g.fed = true;
      carrying--;
      fed++;
      stage.sfx('chime');
      stage.sfx('cheer', 0.4);
      for (let k = g.from; k < g.to; k++) crowd.people[k].cheer = Math.random() < 0.5;
      setTimeout(() => {
        for (let k = g.from; k < g.to; k++) crowd.people[k].cheer = false;
      }, 2500);
      const old = g.label;
      g.label = makeLabel('Fed!', { size: 0.6, color: '#9cf0b8' });
      g.label.position.copy(old.position);
      stage.scene.remove(old);
      stage.scene.add(g.label);
      stage.addXP(15);
      stage.count(`Fed ${fed}/${total}`);
      if (carrying === 0) {
        stage.player.char.attachItem('none');
        if (fed < total) stage.objective('Return to Jesus for more bread', jesus, `Fed ${fed}/${total}`);
      }
    }, 7.5, () => !g.fed);
  }
  const stopT = stage.onUpdate((dt) => {
    if (!stage.svc.ui.busy) t += dt;
    hud.setMeter('feed', `Everyone fed: ${fed}/${total}`, fed / total, '#5fd38d');
  });
  await stage.waitUntil(() => fed >= total);
  stopT();
  hud.setMeter('feed', null);
  stage.player.char.attachItem('none');
  for (const g of groups) g.label.visible = false;
  const gameStars = t < 150 ? 3 : t < 240 ? 2 : 1;
  stage.addXP(Math.max(0, Math.round(300 - t)), 'Feeding the crowd');

  // ---- Leftovers
  await stage.talk([
    stage.n('When they were filled…', 'John 6:12'),
    stage.line(jesus, '“Gather up the broken pieces which are left over, that nothing be lost.”', 'John 6:12'),
  ]);
  const pieces: THREE.Group[] = [];
  for (let i = 0; i < 24; i++) {
    const g = groups[i % groups.length];
    const pb = new Builder();
    pb.add(G.sphere(0.16, 6, 5), '#d9a85e', { sy: 0.6 });
    const obj = pb.build({ shadows: false });
    const x = g.x + rand(Math.random, -8, 8);
    const z = g.z + rand(Math.random, -6, 6);
    obj.position.set(x, stage.heightAt(x, z) + 0.35, z);
    const glow = makeFlame(0.9, '#ffe9a8');
    glow.scale.set(0.9, 0.9, 1);
    obj.add(glow);
    stage.scene.add(obj);
    pieces.push(obj);
  }
  const baskets: THREE.Group[] = [];
  let gathered = 0;
  stage.objective('Gather the leftover pieces', () => {
    let best: THREE.Vector3 | null = null;
    let bd = Infinity;
    for (const p of pieces) {
      if (!p.visible) continue;
      const d = p.position.distanceTo(stage.player.position);
      if (d < bd) {
        bd = d;
        best = p.position;
      }
    }
    return best ?? JESUS;
  }, 'Baskets 0/12');
  let andrewAsked = false;
  stage.interactable(andrew, 'Talk to Andrew', async () => {
    if (andrewAsked) return void (await stage.talk([stage.line(andrew, 'I brought a boy with five loaves… I still can’t believe it.')]));
    andrewAsked = true;
    await stage.quiz('Andrew', {
      q: 'What did the boy bring to Jesus?',
      options: ['Seven loaves and a few fish', 'Five barley loaves and two fish', 'Twelve loaves and five fish', 'Two loaves and a jar of honey'],
      answer: 1,
      explain: 'Andrew said, “There is a boy here who has five barley loaves and two fish, but what are these among so many?” Jesus used that small lunch to feed thousands.',
      ref: 'John 6:9',
    });
  }, 3);
  const stopG = stage.onUpdate(() => {
    for (const p of pieces) {
      if (!p.visible) continue;
      p.rotation.y += 0.03;
      if (p.position.distanceTo(stage.player.position.clone().setY(p.position.y)) < 1.6) {
        p.visible = false;
        gathered++;
        stage.sfx('pickup', 0.7);
        if (gathered % 2 === 0) {
          const n = gathered / 2;
          const bb = new Builder();
          bb.add(G.cyl(0.32, 0.24, 0.32, 10), '#b08850', { y: 0.16 });
          bb.add(G.sphere(0.24, 8, 6), '#d9a85e', { y: 0.32, sy: 0.5 });
          const basket = bb.build();
          const a = (n / 12) * Math.PI - Math.PI;
          basket.position.set(JESUS.x + Math.cos(a) * 3, stage.heightAt(JESUS.x, JESUS.z) + 0.02, JESUS.z + 1.5 + Math.sin(a) * -2);
          stage.scene.add(basket);
          baskets.push(basket);
          stage.count(`Baskets ${n}/12`);
          stage.sfx('chime', 0.6);
        }
      }
    }
  });
  await stage.waitUntil(() => gathered >= 24);
  stopG();
  stage.addXP(60, 'Twelve baskets gathered');
  stage.objective('Return to Jesus', jesus);
  await stage.waitUntil(() => stage.player.position.distanceTo(JESUS) < 7);

  await stage.cinematic(async () => {
    cam.cut({ x: 7, y: 3, z: JESUS.z + 7 }, { x: 0, y: 0.8, z: JESUS.z + 1.5 });
    await stage.narrate('So they gathered them up, and filled twelve baskets with broken pieces from the five barley loaves, which were left over by those who had eaten.', 'John 6:13');
    for (const p of crowd.people) p.cheer = Math.random() < 0.4;
    stage.sfx('cheer');
    cam.cut({ x: 0, y: 12, z: JESUS.z - 10 }, { x: 0, y: 1, z: 20 });
    await stage.narrate('When therefore the people saw the sign which Jesus did, they said, “This is truly the prophet who comes into the world.”', 'John 6:14');
    for (const p of crowd.people) p.cheer = false;
  });
  stage.addField(
    new ParticleField({ count: 40, color: '#ffe39a', size: 0.25, spawn: (p, v) => { p.set(JESUS.x + rand(Math.random, -3, 3), stage.heightAt(0, JESUS.z) + Math.random(), JESUS.z + rand(Math.random, -2, 3)); v.set(0, 0.5, 0); return 3; } }),
  );
  stage.objective('Talk to the boy', boy);
  await stage.waitTalk(boy);
  await stage.talk([
    stage.line(boy, 'Did you see? My five loaves! Twelve baskets left over! I gave him a little, and he made it more than enough.'),
    stage.n('The next day, in Capernaum, Jesus told the crowds what that bread was pointing to.', 'John 6:24–35'),
  ]);
  await stage.verse(META.verseId);
  return gameStars;
}

const loaves: EraModule = {
  atmosphere: 'golden',
  music: { root: 60, scale: SCALES.dorian, bpm: 90, instrument: 'harp', drone: 0.5, drums: 'soft', density: 0.42 },
  setup,
  play,
};

export default loaves;
