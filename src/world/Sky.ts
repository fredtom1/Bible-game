import * as THREE from 'three';

/**
 * Gradient sky dome with sun disc + glow, soft procedural clouds and
 * twinkling stars. All colours are uniforms so the World can blend between
 * times of day for storytelling (storm rolling in, night falling, dawn).
 */
const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // keep at far plane
}`;

const frag = /* glsl */ `
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 bottomColor;
uniform vec3 sunColor;
uniform vec3 sunDir;
uniform float sunSize;
uniform float stars;
uniform float clouds;
uniform vec3 cloudColor;
uniform float time;
varying vec3 vDir;

float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0
    ? mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.55))
    : mix(horizonColor, bottomColor, pow(clamp(-h * 3.0, 0.0, 1.0), 0.6));
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * (pow(sd, 6.0) * 0.25 + pow(sd, 64.0) * 0.5);
  col += sunColor * smoothstep(1.0 - sunSize, 1.0 - sunSize * 0.6, sd) * 2.5;
  if (clouds > 0.0 && h > 0.0) {
    vec2 uv = d.xz / (h + 0.18) * 1.6 + vec2(time * 0.01, time * 0.004);
    float c = fbm(uv);
    float cov = smoothstep(1.0 - clouds * 0.75, 1.0, c + 0.28);
    vec3 cc = mix(cloudColor, sunColor * 1.2 + cloudColor * 0.5, pow(sd, 4.0) * 0.6);
    col = mix(col, cc, cov * smoothstep(0.0, 0.12, h) * 0.9);
  }
  if (stars > 0.0 && h > 0.0) {
    vec3 q = floor(d * 320.0);
    float s = hash(q);
    float tw = 0.6 + 0.4 * sin(time * 2.0 + s * 50.0);
    col += vec3(step(0.9965, s) * tw * stars * smoothstep(0.0, 0.25, h));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class SkyDome {
  readonly mesh: THREE.Mesh;
  readonly uniforms: {
    topColor: { value: THREE.Color };
    horizonColor: { value: THREE.Color };
    bottomColor: { value: THREE.Color };
    sunColor: { value: THREE.Color };
    sunDir: { value: THREE.Vector3 };
    sunSize: { value: number };
    stars: { value: number };
    clouds: { value: number };
    cloudColor: { value: THREE.Color };
    time: { value: number };
  };

  constructor() {
    this.uniforms = {
      topColor: { value: new THREE.Color('#3a7bd5') },
      horizonColor: { value: new THREE.Color('#cfe6ff') },
      bottomColor: { value: new THREE.Color('#8a7a60') },
      sunColor: { value: new THREE.Color('#fff2c9') },
      sunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3).normalize() },
      sunSize: { value: 0.0012 },
      stars: { value: 0 },
      clouds: { value: 0.4 },
      cloudColor: { value: new THREE.Color('#ffffff') },
      time: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vert,
      fragmentShader: frag,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  update(dt: number, camera: THREE.Camera): void {
    this.uniforms.time.value += dt;
    this.mesh.position.copy(camera.position);
  }
}

export interface Atmosphere {
  top: string;
  horizon: string;
  bottom: string;
  sun: string;
  sunDir: [number, number, number];
  sunSize: number;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fog: string;
  fogNear: number;
  fogFar: number;
  stars: number;
  clouds: number;
  cloudColor: string;
  exposure: number;
}

export const ATMOS: Record<string, Atmosphere> = {
  day: {
    top: '#2f6fd0', horizon: '#cfe5f7', bottom: '#b9a27c', sun: '#fff1cf', sunDir: [0.35, 0.8, 0.25], sunSize: 0.0012,
    sunIntensity: 2.6, hemiSky: '#cfe6ff', hemiGround: '#8c7a5b', hemiIntensity: 1.1, fog: '#cfe0ee', fogNear: 60, fogFar: 380,
    stars: 0, clouds: 0.45, cloudColor: '#ffffff', exposure: 1.0,
  },
  hot: {
    top: '#3b7bd0', horizon: '#f3e2bd', bottom: '#d8b98a', sun: '#fff0c0', sunDir: [0.2, 0.9, 0.3], sunSize: 0.0014,
    sunIntensity: 3.0, hemiSky: '#e9f1ff', hemiGround: '#b08a55', hemiIntensity: 1.1, fog: '#f0e2c4', fogNear: 60, fogFar: 360,
    stars: 0, clouds: 0.2, cloudColor: '#fffaf0', exposure: 1.0,
  },
  golden: {
    top: '#4a69b8', horizon: '#ffc58a', bottom: '#8a6648', sun: '#ffcf88', sunDir: [0.75, 0.22, 0.2], sunSize: 0.0016,
    sunIntensity: 2.4, hemiSky: '#ffd9b0', hemiGround: '#6f5a46', hemiIntensity: 0.9, fog: '#f2c79c', fogNear: 50, fogFar: 340,
    stars: 0, clouds: 0.45, cloudColor: '#ffe2c6', exposure: 1.0,
  },
  dusk: {
    top: '#1d2a5c', horizon: '#e0866a', bottom: '#3b2c34', sun: '#ff9a62', sunDir: [0.85, 0.06, 0.1], sunSize: 0.0018,
    sunIntensity: 1.3, hemiSky: '#8a7fb8', hemiGround: '#3c2d2a', hemiIntensity: 0.7, fog: '#8f6a78', fogNear: 40, fogFar: 300,
    stars: 0.3, clouds: 0.35, cloudColor: '#d9938a', exposure: 1.0,
  },
  night: {
    top: '#050a1f', horizon: '#1b2a4d', bottom: '#0b0d18', sun: '#a9c4ff', sunDir: [-0.4, 0.55, -0.3], sunSize: 0.0009,
    sunIntensity: 0.55, hemiSky: '#4a64a0', hemiGround: '#1c1c2a', hemiIntensity: 0.75, fog: '#121a33', fogNear: 30, fogFar: 240,
    stars: 1, clouds: 0.15, cloudColor: '#26324f', exposure: 1.15,
  },
  storm: {
    top: '#2a2f3a', horizon: '#5d6573', bottom: '#2e3036', sun: '#8e97a8', sunDir: [0.3, 0.7, 0.2], sunSize: 0.0001,
    sunIntensity: 0.5, hemiSky: '#8590a3', hemiGround: '#2f3136', hemiIntensity: 0.8, fog: '#4f5663', fogNear: 15, fogFar: 160,
    stars: 0, clouds: 1, cloudColor: '#3d424c', exposure: 1.05,
  },
  dawn: {
    top: '#2c3f7a', horizon: '#f6b48f', bottom: '#4a3a3f', sun: '#ffd0a1', sunDir: [-0.85, 0.12, 0.3], sunSize: 0.0016,
    sunIntensity: 1.7, hemiSky: '#c9b2d8', hemiGround: '#4f4040', hemiIntensity: 0.8, fog: '#d8a99a', fogNear: 40, fogFar: 300,
    stars: 0.1, clouds: 0.4, cloudColor: '#f3c2b0', exposure: 1.0,
  },
  heaven: {
    top: '#2a1660', horizon: '#ffb38f', bottom: '#f6c9b8', sun: '#ffe2a8', sunDir: [0.6, 0.22, -0.5], sunSize: 0.002,
    sunIntensity: 2.3, hemiSky: '#ffd2c2', hemiGround: '#6a4b8a', hemiIntensity: 1.0, fog: '#f2b6a6', fogNear: 110, fogFar: 520,
    stars: 0.6, clouds: 0.5, cloudColor: '#ffd9cf', exposure: 1.0,
  },
};
