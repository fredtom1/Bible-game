import * as THREE from 'three';
import { Character, makeLabel, type Look, type Pose } from './Character';
import { damp } from '../engine/noise';
import type { Input } from '../engine/Input';
import type { CameraRig } from '../engine/CameraRig';
import type { TaskRunner } from '../engine/tasks';
import { audio } from '../engine/Audio';

export interface Physics {
  heightAt(x: number, z: number): number;
  resolve(p: THREE.Vector3, r: number): void;
}

/** The player's avatar and third-person controller. */
export class Player {
  char: Character;
  readonly vel = new THREE.Vector3();
  walkSpeed = 4.4;
  runSpeed = 7.8;
  speedMul = 1;
  frozen = false;
  grounded = true;
  stamina = 1;
  useStamina = false;
  /** When true the script moves the avatar (no physics/input). */
  scripted = false;
  private stepT = 0;

  constructor(look: Look) {
    this.char = new Character(look);
  }

  get position(): THREE.Vector3 {
    return this.char.root.position;
  }

  get heading(): number {
    return this.char.heading;
  }

  rebuild(look: Look, scene: THREE.Object3D): void {
    const pos = this.position.clone();
    const h = this.char.heading;
    scene.remove(this.char.root);
    this.char = new Character(look);
    this.char.root.position.copy(pos);
    this.char.heading = h;
    this.char.root.rotation.y = h;
    scene.add(this.char.root);
  }

  teleport(x: number, z: number, heading: number, phys: Physics): void {
    this.position.set(x, phys.heightAt(x, z), z);
    this.vel.set(0, 0, 0);
    this.char.heading = heading;
    this.char.root.rotation.y = heading;
  }

  update(dt: number, input: Input, cam: CameraRig, phys: Physics): void {
    const p = this.position;
    if (this.scripted) {
      this.char.update(dt);
      if (this.char.speed > 1) {
        this.stepT += dt * this.char.speed * 0.55;
        if (this.stepT > 1) {
          this.stepT = 0;
          audio.play('step', 0.6);
        }
      }
      return;
    }
    let mx = 0;
    let mz = 0;
    let running = false;
    if (!this.frozen) {
      const { fx, fz, rx, rz } = cam.basis();
      mx = fx * input.move.y + rx * input.move.x;
      mz = fz * input.move.y + rz * input.move.x;
      running = input.down('run') && (!this.useStamina || this.stamina > 0.05);
    }
    const mag = Math.min(1, Math.hypot(mx, mz));
    const speed = (running ? this.runSpeed : this.walkSpeed) * this.speedMul * mag;
    if (this.useStamina) {
      if (running && mag > 0.1) this.stamina = Math.max(0, this.stamina - dt * 0.22);
      else this.stamina = Math.min(1, this.stamina + dt * 0.18);
    }
    const tvx = mag > 0.01 ? (mx / (mag || 1)) * speed : 0;
    const tvz = mag > 0.01 ? (mz / (mag || 1)) * speed : 0;
    const k = damp(this.grounded ? 12 : 3, dt);
    this.vel.x += (tvx - this.vel.x) * k;
    this.vel.z += (tvz - this.vel.z) * k;
    if (!this.frozen && this.grounded && input.pressed('jump')) {
      this.vel.y = 6.2;
      this.grounded = false;
    }
    this.vel.y -= 18 * dt;
    p.x += this.vel.x * dt;
    p.z += this.vel.z * dt;
    p.y += this.vel.y * dt;
    phys.resolve(p, 0.38);
    const g = phys.heightAt(p.x, p.z);
    if (p.y <= g) {
      if (!this.grounded && this.vel.y < -4) audio.play('step', 1.4);
      p.y = g;
      this.vel.y = 0;
      this.grounded = true;
    } else if (p.y - g > 0.25) {
      this.grounded = false;
    } else if (this.vel.y <= 0) {
      p.y = g;
      this.grounded = true;
    }
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.3) this.char.turnTo(Math.atan2(this.vel.x, this.vel.z), dt, 12);
    this.char.speed = this.grounded ? hs : hs * 0.3;
    this.char.update(dt);
    if (this.grounded && hs > 1) {
      this.stepT += dt * hs * 0.55;
      if (this.stepT > 1) {
        this.stepT = 0;
        audio.play('step', 0.7);
      }
    }
    cam.fovBoost = running && hs > 5 ? 6 : 0;
  }
}

/** A story character: name tag, poses, path-walking and facing helpers. */
export class NPC {
  readonly char: Character;
  readonly name: string;
  readonly tag: THREE.Sprite;
  talkRadius = 3.2;
  /** Portrait colour for the dialogue box. */
  color: string;
  private walkTarget: THREE.Vector3 | null = null;
  private walkSpeed = 2;
  private walkResolve: (() => void) | null = null;
  followTarget: THREE.Object3D | null = null;
  followDist = 2;
  followSpeed = 4.5;
  idlePose: Pose = 'idle';
  faceTarget: THREE.Vector3 | null = null;
  showTag = true;
  /** Free-form state for era scripts. */
  data: Record<string, unknown> = {};
  /** When true the script drives position/speed directly (processions). */
  manual = false;

  constructor(name: string, look: Look, color?: string) {
    this.name = name;
    this.char = new Character(look);
    this.color = color ?? look.robe;
    this.tag = makeLabel(name, { size: 0.32 });
    this.tag.position.y = 2.05;
    this.tag.visible = false;
    this.char.root.add(this.tag);
  }

  get position(): THREE.Vector3 {
    return this.char.root.position;
  }

  place(x: number, z: number, heading: number, phys: Physics): this {
    this.char.root.position.set(x, phys.heightAt(x, z), z);
    this.char.heading = heading;
    this.char.root.rotation.y = heading;
    return this;
  }

  face(x: number, z: number): void {
    this.char.face(x, z);
  }

  setPose(p: Pose): void {
    this.idlePose = p;
    this.char.pose = p;
  }

  /** Walk to a point; resolves on arrival (or when aborted by the runner). */
  walkTo(runner: TaskRunner, x: number, z: number, speed = 2.2): Promise<void> {
    this.walkTarget = new THREE.Vector3(x, 0, z);
    this.walkSpeed = speed;
    this.followTarget = null;
    return runner.guard(
      new Promise<void>((resolve) => {
        this.walkResolve = resolve;
      }),
    );
  }

  /** Walk through a sequence of points. */
  async walkPath(runner: TaskRunner, pts: [number, number][], speed = 2.2): Promise<void> {
    for (const [x, z] of pts) await this.walkTo(runner, x, z, speed);
  }

  stop(): void {
    this.walkTarget = null;
    this.walkResolve?.();
    this.walkResolve = null;
  }

  update(dt: number, phys: Physics, playerPos: THREE.Vector3): void {
    const p = this.position;
    if (this.manual) {
      this.tag.visible = false;
      this.char.update(dt);
      return;
    }
    let speed = 0;
    let target: THREE.Vector3 | null = this.walkTarget;
    let s = this.walkSpeed;
    if (!target && this.followTarget) {
      const fp = this.followTarget.position;
      const d = Math.hypot(fp.x - p.x, fp.z - p.z);
      if (d > this.followDist) {
        target = fp;
        s = Math.min(this.followSpeed * 1.6, (d - this.followDist) * 2 + 2);
      }
    }
    if (target) {
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.25 && this.walkTarget) {
        this.walkTarget = null;
        const r = this.walkResolve;
        this.walkResolve = null;
        r?.();
      } else if (d > 0.05) {
        speed = Math.min(s, d * 4);
        p.x += (dx / d) * speed * dt;
        p.z += (dz / d) * speed * dt;
        this.char.turnTo(Math.atan2(dx, dz), dt, 8);
      }
    } else if (this.faceTarget) {
      this.char.turnTo(Math.atan2(this.faceTarget.x - p.x, this.faceTarget.z - p.z), dt, 4);
    }
    p.y = phys.heightAt(p.x, p.z);
    this.char.speed = speed;
    if (speed > 0.2 && this.char.pose !== 'carry' && this.char.pose !== 'blow' && this.char.pose !== 'raise') this.char.pose = 'idle';
    else if (speed <= 0.2 && this.char.pose === 'idle') this.char.pose = this.idlePose;
    const dPlayer = p.distanceTo(playerPos);
    this.tag.visible = this.showTag && dPlayer < 9;
    this.char.lookTarget = dPlayer < 6 ? playerPos.clone().setY(playerPos.y + 1.5) : null;
    this.char.update(dt);
  }
}
