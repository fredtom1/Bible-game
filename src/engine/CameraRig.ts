import * as THREE from 'three';
import { clamp, damp } from './noise';
import { Ease, type TaskRunner } from './tasks';

/**
 * Third-person orbit camera with smoothing, terrain avoidance, shake, FOV
 * kick, and promise-based cinematic moves for cutscenes.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: 'follow' | 'cinematic' = 'follow';
  yaw = 0;
  pitch = 0.38;
  distance = 7.5;
  minPitch = -0.15;
  maxPitch = 1.2;
  height = 1.5;
  lockYaw = false;
  baseFov = 60;
  fovBoost = 0;
  ground: (x: number, z: number) => number = () => 0;

  private focus = new THREE.Vector3();
  private focusTarget = new THREE.Vector3();
  private cinePos = new THREE.Vector3();
  private cineLook = new THREE.Vector3();
  private shakeAmp = 0;
  private shakeTime = 0;
  private tmp = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(this.baseFov, aspect, 0.1, 1500);
    this.camera.position.set(0, 5, 10);
  }

  /** Point the camera behind something facing `heading` (radians). */
  snapBehind(target: THREE.Vector3, heading: number): void {
    this.yaw = heading + Math.PI;
    this.focusTarget.copy(target);
    this.focus.copy(target);
  }

  setFocus(p: THREE.Vector3): void {
    this.focusTarget.copy(p);
  }

  /** Unit vectors on XZ for camera-relative movement. */
  basis(): { fx: number; fz: number; rx: number; rz: number } {
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    return { fx, fz, rx: Math.cos(this.yaw), rz: -Math.sin(this.yaw) };
  }

  shake(amount: number, seconds: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
    this.shakeTime = Math.max(this.shakeTime, seconds);
  }

  update(dt: number, lookDx: number, lookDy: number): void {
    const cam = this.camera;
    if (this.mode === 'follow') {
      if (!this.lockYaw) this.yaw -= lookDx;
      this.pitch = clamp(this.pitch + lookDy, this.minPitch, this.maxPitch);
      this.focus.lerp(this.focusTarget, damp(12, dt));
      const cp = Math.cos(this.pitch);
      const off = this.tmp.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
      const desired = off.multiplyScalar(this.distance).add(this.focus);
      desired.y += this.height;
      const g = this.ground(desired.x, desired.z) + 0.6;
      if (desired.y < g) desired.y = g;
      cam.position.lerp(desired, damp(14, dt));
      this.tmp.copy(this.focus);
      this.tmp.y += this.height;
      cam.lookAt(this.tmp);
    } else {
      cam.position.copy(this.cinePos);
      cam.lookAt(this.cineLook);
    }
    const fov = this.baseFov + this.fovBoost;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov += (fov - cam.fov) * damp(6, dt);
      cam.updateProjectionMatrix();
    }
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const a = this.shakeAmp * Math.min(1, this.shakeTime * 2);
      cam.position.x += (Math.random() - 0.5) * a;
      cam.position.y += (Math.random() - 0.5) * a;
      cam.position.z += (Math.random() - 0.5) * a;
      if (this.shakeTime <= 0) this.shakeAmp = 0;
    }
  }

  /** Enter cinematic mode at the current view. */
  beginCinematic(): void {
    if (this.mode === 'cinematic') return;
    this.mode = 'cinematic';
    this.cinePos.copy(this.camera.position);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.cineLook.copy(this.camera.position).addScaledVector(dir, 10);
  }

  endCinematic(): void {
    this.mode = 'follow';
  }

  cut(pos: THREE.Vector3Like, look: THREE.Vector3Like): void {
    this.beginCinematic();
    this.cinePos.set(pos.x, pos.y, pos.z);
    this.cineLook.set(look.x, look.y, look.z);
  }

  /** Smoothly fly to a pose (cinematic mode). */
  moveTo(
    runner: TaskRunner,
    pos: THREE.Vector3Like,
    look: THREE.Vector3Like,
    seconds: number,
    ease = Ease.inOut,
  ): Promise<void> {
    this.beginCinematic();
    const p0 = this.cinePos.clone();
    const l0 = this.cineLook.clone();
    const p1 = new THREE.Vector3(pos.x, pos.y, pos.z);
    const l1 = new THREE.Vector3(look.x, look.y, look.z);
    return runner.tween(
      seconds,
      (t) => {
        this.cinePos.lerpVectors(p0, p1, t);
        this.cineLook.lerpVectors(l0, l1, t);
      },
      ease,
    );
  }

  /** Orbit around a point during a cutscene. */
  orbit(
    runner: TaskRunner,
    center: THREE.Vector3Like,
    radius: number,
    height: number,
    fromAngle: number,
    toAngle: number,
    seconds: number,
  ): Promise<void> {
    this.beginCinematic();
    return runner.tween(
      seconds,
      (t) => {
        const a = fromAngle + (toAngle - fromAngle) * t;
        this.cinePos.set(center.x + Math.sin(a) * radius, center.y + height, center.z + Math.cos(a) * radius);
        this.cineLook.set(center.x, center.y, center.z);
      },
      Ease.sine,
    );
  }

  /** Hand control back to follow mode, starting from the current shot. */
  release(target: THREE.Vector3): void {
    const off = this.camera.position.clone().sub(target);
    this.yaw = Math.atan2(off.x, off.z);
    this.focus.copy(target);
    this.focusTarget.copy(target);
    this.mode = 'follow';
  }
}
