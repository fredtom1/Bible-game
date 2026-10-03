import * as THREE from 'three';

let softTex: THREE.Texture | null = null;
/** A soft round sprite texture generated on a canvas (shared). */
export function softTexture(): THREE.Texture {
  if (softTex) return softTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  softTex = new THREE.CanvasTexture(c);
  softTex.userData.shared = true;
  return softTex;
}

/** Falling rain streaks that follow the camera. */
export class Rain {
  readonly mesh: THREE.LineSegments;
  private pos: Float32Array;
  private speeds: Float32Array;
  intensity = 0;
  private readonly count: number;

  constructor(count = 2500, private area = 60) {
    this.count = count;
    this.pos = new Float32Array(count * 6);
    this.speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) this.respawn(i, Math.random() * 30);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: '#b9c9dc', transparent: true, opacity: 0.45, fog: true });
    this.mesh = new THREE.LineSegments(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  private respawn(i: number, y: number): void {
    const x = (Math.random() - 0.5) * this.area;
    const z = (Math.random() - 0.5) * this.area;
    const len = 0.6 + Math.random() * 0.5;
    this.pos.set([x, y, z, x + 0.05, y - len, z], i * 6);
    this.speeds[i] = 22 + Math.random() * 10;
  }

  update(dt: number, center: THREE.Vector3): void {
    this.mesh.visible = this.intensity > 0.01;
    if (!this.mesh.visible) return;
    this.mesh.position.set(center.x, center.y - 4, center.z);
    const active = Math.floor(this.count * Math.min(1, this.intensity));
    for (let i = 0; i < active; i++) {
      const o = i * 6;
      const d = this.speeds[i] * dt;
      this.pos[o + 1] -= d;
      this.pos[o + 4] -= d;
      if (this.pos[o + 4] < -6) this.respawn(i, 26 + Math.random() * 6);
    }
    this.mesh.geometry.setDrawRange(0, active * 2);
    (this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}

export interface FieldOpts {
  count: number;
  color: THREE.ColorRepresentation;
  size: number;
  additive?: boolean;
  opacity?: number;
  /** Spawn a particle: write position/velocity, return lifetime (s). */
  spawn: (p: THREE.Vector3, v: THREE.Vector3, i: number) => number;
  gravity?: number;
  drag?: number;
  fadeIn?: number;
}

/** General-purpose particle field (sparkles, dust, embers, fireflies…). */
export class ParticleField {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private alpha: Float32Array;
  emitting = true;
  private v = new THREE.Vector3();
  private p = new THREE.Vector3();

  constructor(private opts: FieldOpts) {
    const n = opts.count;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.alpha = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.spawnOne(i);
      this.life[i] = Math.random() * this.maxLife[i];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: softTexture() },
        color: { value: new THREE.Color(opts.color) },
        size: { value: opts.size },
        opacity: { value: opts.opacity ?? 1 },
        scale: { value: window.innerHeight / 2 },
      },
      vertexShader: /* glsl */ `
        attribute float alpha; varying float vA; uniform float size; uniform float scale;
        void main() { vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform vec3 color; uniform float opacity; varying float vA;
        void main() { vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(color, t.a * vA * opacity);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  private spawnOne(i: number): void {
    this.p.set(0, 0, 0);
    this.v.set(0, 0, 0);
    this.maxLife[i] = this.opts.spawn(this.p, this.v, i);
    this.life[i] = 0;
    this.pos.set([this.p.x, this.p.y, this.p.z], i * 3);
    this.vel.set([this.v.x, this.v.y, this.v.z], i * 3);
  }

  setColor(c: THREE.ColorRepresentation): void {
    ((this.points.material as THREE.ShaderMaterial).uniforms.color.value as THREE.Color).set(c);
  }

  setOpacity(o: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.opacity.value = o;
  }

  update(dt: number): void {
    const g = this.opts.gravity ?? 0;
    const drag = this.opts.drag ?? 0;
    const fadeIn = this.opts.fadeIn ?? 0.2;
    for (let i = 0; i < this.life.length; i++) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) {
        if (this.emitting) this.spawnOne(i);
        else {
          this.alpha[i] = 0;
          continue;
        }
      }
      const o = i * 3;
      this.vel[o + 1] -= g * dt;
      if (drag) {
        const k = Math.max(0, 1 - drag * dt);
        this.vel[o] *= k;
        this.vel[o + 1] *= k;
        this.vel[o + 2] *= k;
      }
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.min(1, t / fadeIn) * (1 - t);
    }
    const geo = this.points.geometry;
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('alpha') as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** A flickering additive flame sprite (torches, campfires, the pillar of fire). */
export function makeFlame(scale = 1, color = '#ffb347'): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: softTexture(),
    color,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(scale, scale * 1.5, 1);
  s.userData.base = scale;
  s.userData.seed = Math.random() * 100;
  return s;
}

export function flickerFlame(s: THREE.Sprite, t: number): void {
  const b = s.userData.base as number;
  const k = 1 + Math.sin(t * 13 + s.userData.seed) * 0.08 + Math.sin(t * 23 + s.userData.seed * 2) * 0.06;
  s.scale.set(b * k, b * 1.5 * k, 1);
}
