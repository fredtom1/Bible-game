import * as THREE from 'three';
import type { EraModule } from '../eraTypes';
import type { Stage } from '../../world/Stage';
import { Builder, G } from '../../world/geo';
import { Noise2D, smoothstep, rand } from '../../engine/noise';
import { SCALES } from '../../engine/Audio';
import { Ease } from '../../engine/tasks';
import { tent, rock, oliveTree, leafyTree, bush, grass, flowers, jar } from '../../world/props';
import { lerpColor } from '../../world/Terrain';
import { ParticleField, makeFlame } from '../../world/Particles';
import { Crowd } from '../../world/Crowd';
import { h } from '../../ui/dom';
import { ERA_BY_ID } from '../catalog';
import type { NPC } from '../../world/actors';
import type { Look } from '../../world/Character';

const META = ERA_BY_ID.david;
const brookX = (z: number) => Math.sin(z * 0.045) * 5;

let david: NPC, captain: NPC, keeper: NPC, eliab: NPC, abinadab: NPC, shammah: NPC, saul: NPC, goliath: NPC, bearer: NPC, soldier: NPC;
let israel: Crowd;
let philistines: Crowd;
let stones: { obj: THREE.Group; smooth: boolean; taken: boolean; x: number; z: number }[] = [];

const LOOKS: Record<string, Look> = {
  david: { skin: '#b07650', robe: '#c9b48a', robe2: '#a8905e', sash: '#7a4a2a', hair: 'short', hairColor: '#7a3a1a', item: 'staff', height: 0.9 },
  captain: { skin: '#9c6a45', robe: '#6a4a2a', sash: '#c9a24a', hair: 'short', beard: 'short', headwear: 'helmet', armor: true, item: 'spear' },
  keeper: { skin: '#8d5a3b', robe: '#8a7a6a', sash: '#5a4030', hair: 'short', hairColor: '#cfcac2', beard: 'long', beardColor: '#e2ddd4', headwear: 'headwrap' },
  eliab: { skin: '#9c6a45', robe: '#5a4a3a', sash: '#8a2a2a', hair: 'short', beard: 'short', headwear: 'helmet', armor: true, item: 'spear', height: 1.1 },
  brother: { skin: '#9c6a45', robe: '#6a5a3a', sash: '#2a4a8a', hair: 'short', beard: 'short', headwear: 'helmet', armor: true, item: 'spear' },
  saul: { skin: '#9c6a45', robe: '#5a2a6a', robe2: '#7a3a8a', sash: '#e6b93a', hair: 'long', hairColor: '#2a1a12', beard: 'long', beardColor: '#2a1a12', headwear: 'crown', height: 1.12, armor: true },
  goliath: { skin: '#b07650', robe: '#6a3020', sash: '#3a2a1a', hair: 'short', beard: 'short', beardColor: '#3a1a10', headwear: 'helmet', armor: true, item: 'spear', height: 1.68, build: 1.2 },
  bearer: { skin: '#b07650', robe: '#7a3a2a', sash: '#3a2a1a', hair: 'short', headwear: 'helmet', armor: true, shield: true },
  soldier: { skin: '#8d5a3b', robe: '#5a4a3a', sash: '#3a3a48', hair: 'short', beard: 'short', headwear: 'helmet', armor: true, item: 'spear' },
};

function setup(stage: Stage): void {
  stones = [];
  const noise = new Noise2D(53);
  const rng = stage.rng;
  const ground = (x: number, z: number) => {
    const dx = Math.abs(x - brookX(z));
    let h = smoothstep(6, 75, Math.abs(x)) * 24 + noise.fbm(x * 0.02, z * 0.02, 4) * 3;
    h -= (1 - smoothstep(0, 3.2, dx)) * 0.9;
    return h;
  };
  stage.heightFn = ground;
  stage.terrain({
    size: 300,
    segments: 130,
    height: ground,
    color: (x, z, y, slope) => {
      const dx = Math.abs(x - brookX(z));
      if (dx < 2.6) return lerpColor('#6f6a5a', '#8a826a', noise.get(x * 0.3, z * 0.3) * 0.5 + 0.5);
      if (dx < 6) return '#6a8f45';
      if (slope > 0.42) return lerpColor('#9a8a6a', '#b0a080', noise.get(x * 0.08, z * 0.08) * 0.5 + 0.5);
      return lerpColor('#8aa055', '#b4ac6a', smoothstep(4, 22, y) * 0.7 + noise.get(x * 0.03, z * 0.03) * 0.2);
    },
  });
  stage.bounds = { x0: -110, x1: 26, z0: -85, z1: 85 };
  // the brook
  const brook = new THREE.Group();
  for (let z = -140; z < 140; z += 10) {
    const m = stage.water(4.2, 10.5, brookX(z + 5), ground(brookX(z + 5), z + 5) + 0.55, z + 5, { deep: '#2b5a6a', shallow: '#7ac0c8', amp: 0.02, foam: 0.25 }, 3);
    m.rotation.y = -Math.atan(Math.cos((z + 5) * 0.045) * 5 * 0.045);
    brook.add(m);
  }
  const b = stage.statics;
  // Israel's camp (west ridge)
  for (let i = 0; i < 22; i++) {
    const x = rand(rng, -100, -55);
    const z = rand(rng, -60, 60);
    if (Math.hypot(x + 66, z + 12) < 10 || Math.hypot(x + 55, z - 24) < 8) continue;
    const ry = rand(rng, 0, Math.PI);
    tent(b, { x, y: ground(x, z), z, ry }, i % 2 ? '#3e3028' : '#5a4436');
    stage.addBox(x, z, 4.2, 3.8, ry);
  }
  // Saul's royal tent
  b.at({ x: -66, y: ground(-66, -12), z: -12, ry: Math.PI / 2 }, () => {
    b.add(G.cone(5.2, 5, 8), '#7a3a8a', { kind: 'cloth', y: 2.5 });
    b.add(G.cyl(5, 5, 2.2, 8, ), '#e6d6b0', { kind: 'cloth', y: 1.1 });
    b.add(G.cyl(0.1, 0.1, 7, 5), '#6a4a2a', { y: 3.5 });
    b.add(G.box(1.4, 0.8, 0.1), '#c9a24a', { y: 6.6, x: 0.7 });
  });
  stage.addCircle(-66, -12, 5.2);
  // armour rack beside it
  b.add(G.box(2.4, 0.15, 0.4), '#6a4a2a', { x: -58, y: ground(-58, -16) + 1.6, z: -16 });
  b.add(G.sphere(0.25, 8, 6), '#b08038', { kind: 'metal', x: -57.4, y: ground(-58, -16) + 1.9, z: -16 });
  // supplies with the baggage keeper
  for (let i = 0; i < 9; i++) jar(b, { x: -50 + (i % 3) * 0.7, y: ground(-50, 28), z: 28 + Math.floor(i / 3) * 0.7 }, i % 2 ? '#b5653a' : '#c98a52');
  for (let i = 0; i < 4; i++) b.add(G.box(0.9, 0.7, 0.9), '#8a6a42', { x: -54 + i, y: ground(-54, 31) + 0.35, z: 31 });
  // Philistine camp (east ridge)
  for (let i = 0; i < 20; i++) {
    const x = rand(rng, 55, 100);
    const z = rand(rng, -60, 60);
    tent(b, { x, y: ground(x, z), z, ry: rand(rng, 0, Math.PI) }, i % 2 ? '#6a2a2a' : '#4a3a5a', '#e0c080');
  }
  // trees, rocks
  for (let i = 0; i < 80; i++) {
    const x = rand(rng, -110, 110);
    const z = rand(rng, -120, 120);
    if (Math.abs(x - brookX(z)) < 5 || (x < -45 && x > -105 && Math.abs(z) < 62)) continue;
    const y = ground(x, z);
    if (i % 3 === 0) oliveTree(b, { x, y, z }, rng);
    else if (i % 3 === 1) leafyTree(b, { x, y, z }, rng, '#6a8a3a');
    else rock(b, { x, y: y - 0.3, z, s: rand(rng, 0.8, 2) }, rng, '#a8a090');
    stage.addCircle(x, z, 0.9);
  }
  // the great terebinth (Elah) tree
  leafyTree(b, { x: -30, y: ground(-30, 40), z: 40, s: 2.2 }, rng, '#5a7a32');
  stage.addCircle(-30, 40, 1.8);
  for (let i = 0; i < 50; i++) {
    const x = rand(rng, -100, 26);
    const z = rand(rng, -80, 80);
    bush(b, { x, y: ground(x, z), z }, rng, '#7a8a45');
  }
  grass(b, Math.round(900 * stage.svc.quality.particles), { x0: -30, x1: 26, z0: -80, z1: 80 }, ground, (x, z) => Math.abs(x - brookX(z)) > 3, rng, ['#7a9a45', '#8aa850', '#6a8a3a']);
  flowers(b, Math.round(250 * stage.svc.quality.particles), { x0: -30, x1: 26, z0: -80, z1: 80 }, ground, (x, z) => Math.abs(x - brookX(z)) > 3, rng, ['#e8d24a', '#ffffff', '#c86aa8']);

  // Stones in the brook: a few are smooth
  for (let i = 0; i < 34; i++) {
    const z = -60 + i * 3.6 + rand(rng, -1, 1);
    const x = brookX(z) + rand(rng, -1.8, 1.8);
    const smooth = i % 4 === 1;
    const sb = new Builder(rng);
    if (smooth) sb.add(G.sphere(0.2, 10, 8), '#b8b0a4', { sy: 0.65, jitter: 0 });
    else sb.add(G.dodeca(0.24), '#7a7466', { sy: 0.8, jitter: 0.15 });
    const obj = sb.build();
    obj.position.set(x, ground(x, z) + 0.12, z);
    if (smooth) {
      const glint = makeFlame(0.5, '#ffffff');
      glint.position.y = 0.25;
      glint.visible = false;
      obj.add(glint);
      obj.userData.glint = glint;
    }
    stage.scene.add(obj);
    stones.push({ obj, smooth, taken: false, x, z });
  }

  // Armies
  israel = new Crowd(60, rng, { armor: true, robes: ['#5a4a3a', '#6a5a3a', '#4a3a30', '#7a5a3a'] });
  for (let i = 0; i < israel.count; i++) israel.place(i, -40 - (i % 3) * 1.6, -36 + Math.floor(i / 3) * 3.6, Math.PI / 2);
  philistines = new Crowd(60, rng, { armor: true, robes: ['#6a2a2a', '#4a3a5a', '#7a3a2a', '#5a2a3a'] });
  for (let i = 0; i < philistines.count; i++) philistines.place(i, 46 + (i % 3) * 1.6, -36 + Math.floor(i / 3) * 3.6, -Math.PI / 2);
  stage.scene.add(israel.group, philistines.group);
  const gr = (x: number, z: number) => stage.heightAt(x, z);
  stage.onUpdate((dt) => {
    israel.update(dt, gr);
    philistines.update(dt, gr);
  });

  david = stage.addNPC('David', { ...LOOKS.david }, -92, 44, Math.PI / 2, '#a8905e');
  captain = stage.addNPC('Captain of the thousand', { ...LOOKS.captain }, -57, 22, Math.PI, '#6a4a2a');
  keeper = stage.addNPC('Keeper of the baggage', { ...LOOKS.keeper }, -50, 25, -1, '#8a7a6a');
  eliab = stage.addNPC('Eliab', { ...LOOKS.eliab }, -45, 6, Math.PI / 2, '#5a4a3a');
  abinadab = stage.addNPC('Abinadab', { ...LOOKS.brother }, -45.5, 9, Math.PI / 2, '#6a5a3a');
  shammah = stage.addNPC('Shammah', { ...LOOKS.brother, robe: '#4a5a3a' }, -45.5, 3, Math.PI / 2, '#4a5a3a');
  saul = stage.addNPC('King Saul', { ...LOOKS.saul }, -60, -12, Math.PI / 2, '#7a3a8a');
  soldier = stage.addNPC('Soldier', { ...LOOKS.soldier }, -42, -10, Math.PI / 2, '#5a4a3a');
  goliath = stage.addNPC('Goliath of Gath', { ...LOOKS.goliath }, 40, 0, -Math.PI / 2, '#6a3020');
  goliath.talkRadius = 0;
  bearer = stage.addNPC('Shield bearer', { ...LOOKS.bearer }, 38, 1.5, -Math.PI / 2, '#7a3a2a');
  bearer.showTag = false;

  stage.fragment(META.fragments[0], 14, 34);
  stage.fragment(META.fragments[1], -57, -19);
  stage.fragment(META.fragments[2], -100, 62);

  stage.player.teleport(-95, 47, Math.PI / 2, stage);
}

async function play(stage: Stage): Promise<number> {
  const cam = stage.svc.cam;
  const hud = stage.svc.ui.hud;
  const input = stage.svc.input;
  stage.ambient('wind', 0.25);
  stage.ambient('stream', 0.25);

  await stage.cinematic(async () => {
    cam.cut({ x: -20, y: 40, z: 95 }, { x: 0, y: 4, z: 0 });
    await stage.narrate('The Philistines stood on the mountain on the one side, and Israel stood on the mountain on the other side: and there was a valley between them.', '1 Samuel 17:3');
    await cam.moveTo(stage.runner, { x: 20, y: 8, z: 14 }, { x: 40, y: 4, z: 0 }, 4);
    await stage.narrate('A champion named Goliath, of Gath, whose height was six cubits and a span… The Philistine came near morning and evening, and presented himself forty days.', '1 Samuel 17:4, 16');
    await cam.moveTo(stage.runner, { x: -99, y: 3, z: 50 }, { x: -92, y: 1.4, z: 44 }, 3.5);
  });

  // ---- The errand
  stage.objective('Talk to the shepherd boy', david);
  await stage.waitTalk(david);
  await stage.talk([
    stage.line(david, 'Shalom! I’m David, son of Jesse. My three oldest brothers are with King Saul’s army over there.'),
    stage.line(david, 'My father said: “Take for your brothers an ephah of this parched grain, and these ten loaves, and carry them quickly to the camp.”', '1 Samuel 17:17'),
    stage.line(david, '“And bring these ten cheeses to the captain of their thousand, and see how your brothers are doing.” Could you carry the cheeses?', '1 Samuel 17:18'),
  ]);
  stage.player.char.attachItem('basket');
  stage.player.char.pose = 'carry';
  david.followTarget = stage.player.char.root;
  david.followDist = 2.5;
  stage.objective('Deliver the ten cheeses to the captain', captain);
  await stage.waitTalk(captain, 'Give the cheeses to the captain');
  stage.player.char.attachItem('none');
  stage.player.char.pose = 'idle';
  await stage.talk([
    stage.line(captain, 'Cheese from Bethlehem! Jesse is a good man. Tell him his sons are well… for now.'),
    stage.line(keeper, 'Leave your grain and bread here with me, lad. I keep the baggage.', '1 Samuel 17:22'),
  ]);
  stage.addXP(40, 'Supplies delivered');

  // ---- Goliath's challenge
  david.followTarget = null;
  await stage.cinematic(async () => {
    david.place(-46, 12, Math.PI / 2, stage);
    stage.player.teleport(-47, 15, Math.PI / 2, stage);
    void goliath.walkTo(stage.runner, 22, 0, 1.6).catch(() => undefined);
    void bearer.walkTo(stage.runner, 20, 1.5, 1.6).catch(() => undefined);
    cam.cut({ x: 2, y: 3, z: 12 }, { x: 24, y: 4, z: 0 });
    stage.sfx('drum');
    await stage.wait(2);
    stage.sfx('roar', 0.5);
    if (!stage.svc.getSave().settings.reduceMotion) cam.shake(0.15, 1);
    await stage.narrate('“Why have you come out to set your battle in array? Am I not a Philistine, and you servants to Saul? Choose a man for yourselves, and let him come down to me.”', '1 Samuel 17:8');
    stage.sfx('roar', 0.6);
    await stage.narrate('“I defy the armies of Israel today! Give me a man, that we may fight together!”', '1 Samuel 17:10');
    for (let i = 0; i < israel.count; i++) israel.walkTo(i, -55 - Math.random() * 12, israel.people[i].z + rand(Math.random, -3, 3), 6);
    cam.cut({ x: -30, y: 4, z: 18 }, { x: -50, y: 2, z: 5 });
    await stage.narrate('All the men of Israel, when they saw the man, fled from him, and were terrified.', '1 Samuel 17:24');
  });
  stage.chatter(abinadab, [[stage.line(abinadab, 'I’m Abinadab, Jesse’s second son. Eliab is the eldest, and he thinks that puts him in charge of all of us. Even here.')]]);
  stage.chatter(shammah, [[stage.line(shammah, 'Forty days that giant has shouted at us. Morning and evening. Forty days!', '1 Samuel 17:16')]]);
  let soldierQuiz = false;
  stage.interactable(soldier, 'Talk to the soldier', async () => {
    if (soldierQuiz) {
      await stage.talk([
        stage.line(soldier, '“The king will give great riches to the man who kills him, and will give him his daughter.” Nobody has volunteered in forty days.', '1 Samuel 17:25'),
        stage.line(soldier, 'Have you seen his spear? The staff is like a weaver’s beam!', '1 Samuel 17:7'),
      ]);
      return;
    }
    soldierQuiz = true;
    await stage.talk([stage.line(soldier, 'You’re not from here. Do you even know how big that giant is?')]);
    await stage.quiz('A soldier', {
      q: 'How tall was Goliath?',
      options: ['Six feet (1.8 m)', 'Six cubits and a span (about 2.9 m)', 'Twenty cubits (9 m)', 'As tall as a cedar'],
      answer: 1,
      explain: 'The Bible says Goliath’s height was “six cubits and a span”, about 2.9 metres or 9 ft 9 in.',
      ref: '1 Samuel 17:4',
    });
  }, 3);

  stage.objective('Find David by the battle line', david);
  await stage.waitTalk(david);
  await stage.talk([
    stage.line(david, '“For who is this uncircumcised Philistine, that he should defy the armies of the living God?”', '1 Samuel 17:26'),
    stage.line(eliab, '“Why have you come down? With whom have you left those few sheep in the wilderness? I know your pride… you have come down that you might see the battle.”', '1 Samuel 17:28'),
  ]);
  const pk = await stage.talk([{ ...stage.line('me', '(Eliab is glaring at David. What do you say?)'), choices: ['“Leave him alone. He’s right!”', 'Say nothing, and see what David does.'] }]);
  await stage.talk([
    pk[0] === 0 ? stage.line(eliab, 'And who are you? Another shepherd with big ideas?') : stage.n('David doesn’t argue. He simply answers his brother and turns to ask someone else.', '1 Samuel 17:30'),
    stage.line(david, '“What have I now done? Is there not a cause?”', '1 Samuel 17:29'),
    stage.line(david, 'Come with me. I need to speak to the king.'),
  ]);

  // ---- Saul
  david.followTarget = stage.player.char.root;
  stage.objective('Go with David to King Saul’s tent', saul);
  await stage.waitTalk(saul, 'Talk to King Saul');
  david.followTarget = null;
  david.place(-57, -9, -Math.PI / 2, stage);
  await stage.talk([
    stage.line(david, '“Let no man’s heart fail because of him. Your servant will go and fight with this Philistine.”', '1 Samuel 17:32'),
    stage.line(saul, '“You are not able to go against this Philistine to fight with him; for you are but a youth, and he a man of war from his youth.”', '1 Samuel 17:33'),
    stage.line(david, '“Your servant was keeping his father’s sheep; and when a lion or a bear came, and took a lamb out of the flock, I went out after him, and struck him, and rescued it.”', '1 Samuel 17:34–35'),
    stage.line(david, '“Yahweh who delivered me out of the paw of the lion, and out of the paw of the bear, he will deliver me out of the hand of this Philistine.”', '1 Samuel 17:37'),
    stage.line(saul, '“Go! Yahweh will be with you.” But at least take my armour. Here, you too, stranger. Try it on and see.', '1 Samuel 17:37–38'),
  ]);
  const orig = { ...stage.player.char.look };
  stage.player.rebuild({ ...orig, armor: true, headwear: 'helmet', item: 'sword' }, stage.scene);
  stage.player.speedMul = 0.33;
  stage.sfx('thud');
  stage.toast('Saul’s armour is HEAVY…', 'warn');
  const start = stage.player.position.clone();
  stage.objective('Try walking in Saul’s armour', () => start.clone().add(new THREE.Vector3(8, 0, 4)));
  await stage.waitUntil(() => stage.player.position.distanceTo(start) > 6);
  await stage.talk([
    stage.line(david, '“I can’t go with these; for I have not tested them.”', '1 Samuel 17:39'),
    stage.n('So David took them off. He would face the giant as himself: a shepherd, with a staff, a sling, and his trust in God.'),
  ]);
  stage.player.rebuild(orig, stage.scene);
  stage.player.speedMul = 1;

  // ---- Five smooth stones
  let found = 0;
  stage.objective('Choose five smooth stones from the brook', () => {
    let best: THREE.Vector3 | null = null;
    let bd = Infinity;
    for (const s of stones) {
      if (s.taken || !s.smooth) continue;
      const d = s.obj.position.distanceTo(stage.player.position);
      if (d < bd) {
        bd = d;
        best = s.obj.position;
      }
    }
    return best ?? new THREE.Vector3(0, 0, 0);
  }, '0/5');
  await stage.narrate('He chose for himself five smooth stones out of the brook, and put them in the pouch of his shepherd’s bag.', '1 Samuel 17:40', 1);
  stage.toast('Tip: smooth stones glint when you get close.', 'info');
  for (const s of stones) {
    stage.interactable(s.obj, s.smooth ? 'Pick up the smooth stone' : 'Pick up the stone', () => {
      if (s.taken) return;
      if (!s.smooth) {
        stage.sfx('error');
        stage.toast('Too jagged. It would fly crooked. Look for a smooth one.', 'warn');
        return;
      }
      s.taken = true;
      s.obj.visible = false;
      found++;
      stage.sfx('pickup');
      stage.count(`${found}/5`);
      stage.addXP(15);
    }, 1.8, () => !s.taken);
  }
  const glintOn = stage.onUpdate(() => {
    for (const s of stones) {
      const g = s.obj.userData.glint as THREE.Sprite | undefined;
      if (g) g.visible = !s.taken && s.obj.position.distanceTo(stage.player.position) < 5;
    }
  });
  await stage.waitUntil(() => found >= 5);
  glintOn();
  stage.objective(null);

  // ---- The challenge
  await stage.cinematic(async () => {
    david.place(brookX(0) - 1, 0, Math.PI / 2, stage);
    david.char.attachItem('sling');
    stage.player.teleport(-6, 5, Math.PI / 2, stage);
    goliath.place(26, 0, -Math.PI / 2, stage);
    bearer.place(24, 1.6, -Math.PI / 2, stage);
    for (let i = 0; i < israel.count; i++) israel.place(i, -40 - (i % 3) * 1.6, -36 + Math.floor(i / 3) * 3.6, Math.PI / 2);
    cam.cut({ x: 6, y: 2.6, z: 10 }, { x: 18, y: 3.5, z: 0 });
    await stage.narrate('When the Philistine looked around, and saw David, he disdained him; for he was but a youth, and ruddy, and had a good looking face.', '1 Samuel 17:42');
    cam.cut({ x: -4, y: 1.8, z: 4 }, { x: brookX(0), y: 1.4, z: 0 });
    await stage.narrate('“You come to me with a sword, with a spear, and with a javelin; but I come to you in the name of Yahweh of Armies, the God of the armies of Israel, whom you have defied.”', '1 Samuel 17:45');
    await stage.narrate('“…that all this assembly may know that Yahweh doesn’t save with sword and spear; for the battle is Yahweh’s.”', '1 Samuel 17:47');
  });

  // ---- Sling mini-game
  stage.player.frozen = true;
  stage.player.char.root.visible = false;
  david.char.pose = 'throw';
  cam.beginCinematic();
  const setAimCam = () => cam.cut({ x: brookX(0) - 4.5, y: 2.3, z: 1.6 }, { x: goliath.position.x, y: 4.6, z: 0 });
  setAimCam();
  stage.svc.ui.story.letterbox(false);
  const ui = h(
    'div',
    { class: 'sling-ui' },
    h('div', { class: 'sling-label' }, 'Help David aim: release when the marker is in the gold zone!'),
    h('div', { class: 'sling-bar' }, h('div', { class: 'sling-zone' }), h('div', { class: 'sling-marker' })),
    h('div', { class: 'sling-stones' }),
  );
  hud.el.appendChild(ui);
  const zoneEl = ui.querySelector('.sling-zone') as HTMLDivElement;
  const markerEl = ui.querySelector('.sling-marker') as HTMLDivElement;
  const stonesEl = ui.querySelector('.sling-stones') as HTMLDivElement;
  input.mouseAction = true;
  input.setTouchVisible(true);
  input.setActionLabel('Sling!');
  let attempts = 0;
  let hit = false;
  while (!hit && attempts < 5) {
    attempts++;
    stonesEl.textContent = `Stones: ${'●'.repeat(5 - attempts + 1)}${'○'.repeat(attempts - 1)}`;
    const zoneW = 0.14;
    const zoneX = rand(Math.random, 0.15, 0.85 - zoneW);
    zoneEl.style.left = `${zoneX * 100}%`;
    zoneEl.style.width = `${zoneW * 100}%`;
    let ph = Math.random() * 6;
    let m = 0;
    const period = 1.25 - attempts * 0.08;
    let released = false;
    const stop = stage.onUpdate((dt) => {
      ph += (dt * Math.PI * 2) / Math.max(0.6, period);
      m = 0.5 + 0.5 * Math.sin(ph);
      markerEl.style.left = `${m * 100}%`;
      goliath.position.x = Math.max(16, goliath.position.x - dt * 0.6);
      if (Math.random() < dt * 4) stage.sfx('sling', 0.4);
      if (input.pressed('action') || input.pressed('jump') || input.pressed('interact')) released = true;
    });
    await stage.waitUntil(() => released);
    stop();
    hit = m >= zoneX - 0.015 && m <= zoneX + zoneW + 0.015;
    // fly the stone
    const from = new THREE.Vector3(brookX(0) - 0.6, 2.4, 0.4);
    const target = new THREE.Vector3(goliath.position.x - 0.2, goliath.position.y + 4.6, 0);
    if (!hit) target.add(new THREE.Vector3(3, rand(Math.random, -1, 2), (Math.random() < 0.5 ? -1 : 1) * rand(Math.random, 1.5, 3)));
    const pb = new Builder();
    pb.add(G.sphere(0.12, 6, 5), '#b8b0a4');
    const proj = pb.build({ shadows: false });
    stage.scene.add(proj);
    stage.sfx('whoosh', 0.7);
    await stage.tween(0.55, (t) => {
      proj.position.lerpVectors(from, target, t);
      proj.position.y += Math.sin(t * Math.PI) * 1.2;
    }, Ease.linear);
    stage.scene.remove(proj);
    if (!hit) {
      stage.sfx('error');
      hud.setBanner('Missed!', attempts < 5 ? 'David chose five stones. Try again.' : '');
      await stage.wait(1.3);
      hud.setBanner(null);
      setAimCam();
    }
  }
  ui.remove();
  input.setActionLabel(null);
  input.mouseAction = false;
  david.char.pose = 'idle';
  const gameStars = hit ? (attempts === 1 ? 3 : attempts <= 2 ? 2 : 1) : 1;

  // ---- The giant falls
  await stage.cinematic(async () => {
    stage.sfx('stone');
    goliath.manual = true;
    goliath.char.root.rotation.order = 'YXZ';
    cam.cut({ x: goliath.position.x - 9, y: 3, z: 8 }, { x: goliath.position.x, y: 2.5, z: 0 });
    await stage.narrate('David put his hand in his bag, took a stone, and slung it, and struck the Philistine in his forehead. The stone sank into his forehead, and he fell on his face to the earth.', '1 Samuel 17:49');
    await stage.tween(1.4, (t) => (goliath.char.root.rotation.x = Ease.in(t) * 1.45), Ease.linear);
    stage.sfx('thud');
    stage.sfx('rumble', 0.6);
    if (!stage.svc.getSave().settings.reduceMotion) cam.shake(0.35, 1.2);
    stage.addField(
      new ParticleField({
        count: 80,
        color: '#c8b088',
        size: 1.6,
        additive: false,
        opacity: 0.6,
        spawn: (p, v) => {
          p.set(goliath.position.x - rand(Math.random, 0, 4), 0.3, rand(Math.random, -1.5, 1.5));
          v.set(rand(Math.random, -1, 1), rand(Math.random, 0.5, 2), rand(Math.random, -1, 1));
          return 2;
        },
        drag: 1,
      }),
    ).emitting = false;
    for (let i = 0; i < philistines.count; i++) philistines.walkTo(i, 120 + Math.random() * 20, philistines.people[i].z + rand(Math.random, -10, 10), 6);
    bearer.walkTo(stage.runner, 110, 10, 5).catch(() => undefined);
    for (const p of israel.people) p.cheer = true;
    stage.sfx('cheer');
    stage.music({ root: 55, scale: SCALES.majorPent, bpm: 112, instrument: 'harp', drone: 0.4, drums: 'frame', density: 0.55 });
    cam.cut({ x: -20, y: 5, z: 16 }, { x: -42, y: 2, z: 0 });
    await stage.narrate('So David prevailed over the Philistine with a sling and with a stone… but there was no sword in the hand of David.', '1 Samuel 17:50');
  });
  stage.player.char.root.visible = true;
  stage.player.teleport(brookX(0) - 3, 4, Math.PI / 2, stage);
  stage.player.frozen = false;
  goliath.showTag = false;

  stage.objective('Talk to David', david);
  await stage.waitTalk(david);
  await stage.talk([
    stage.line(david, 'You saw it. It wasn’t my strength. It wasn’t my aim. The battle is Yahweh’s!'),
    stage.line(david, 'Want to know a secret? When the prophet Samuel came to our house to anoint a king, he looked at my oldest brother Eliab, tall and strong, and thought, “Surely this is the one.”', '1 Samuel 16:6'),
    stage.line(david, 'But God told him something I’ll never forget.'),
  ]);
  await stage.verse(META.verseId);
  return gameStars;
}

const davidEra: EraModule = {
  atmosphere: 'hot',
  music: { root: 55, scale: SCALES.dorian, bpm: 88, instrument: 'harp', drone: 0.6, drums: 'soft', density: 0.42 },
  setup,
  play,
};

export default davidEra;
